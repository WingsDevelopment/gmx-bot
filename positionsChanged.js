/**
 * Determines if there are changes between previous and current positions.
 * @param {Array} prevPositions - The previous positions data.
 * @param {Array} currentPositions - The current scraped positions data.
 * @returns {Object} - An object indicating if there's a change and the corresponding message.
 */
function positionsChanged(prevPositions, currentPositions) {
  const prevEntries = prevPositions.map((pos) =>
    parseFloat(pos.entryPrice.replace(/[$,]/g, "")).toFixed(2)
  );
  const currentEntries = currentPositions.map((pos) =>
    parseFloat(pos.entryPrice.replace(/[$,]/g, "")).toFixed(2)
  );

  const prevEntrySet = new Set(prevEntries);
  const currentEntrySet = new Set(currentEntries);
  const allEntries = new Set([...prevEntrySet, ...currentEntrySet]);

  for (const entryPrice of allEntries) {
    const inPrev = prevEntrySet.has(entryPrice);
    const inCurrent = currentEntrySet.has(entryPrice);

    if (!inPrev && inCurrent) {
      // New position added
      console.log(`New position added with entryPrice: ${entryPrice}`);
      const newPosition = currentPositions.find(
        (pos) =>
          parseFloat(pos.entryPrice.replace(/[$,]/g, "")).toFixed(2) ===
          entryPrice
      );
      return {
        changed: true,
        message: `*New position added*: ${newPosition.token} at entry price ${entryPrice}`,
      };
    } else if (inPrev && !inCurrent) {
      // Position closed
      console.log(`Position closed with entryPrice: ${entryPrice}`);
      const closedPosition = prevPositions.find(
        (pos) =>
          parseFloat(pos.entryPrice.replace(/[$,]/g, "")).toFixed(2) ===
          entryPrice
      );
      return {
        changed: true,
        message: `*Position closed*: ${closedPosition.token} at entry price ${entryPrice}`,
      };
    }
  }

  // No changes detected in entry prices
  return { changed: false, message: "" };
}

module.exports = positionsChanged;
