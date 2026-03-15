function convertToBaseUnit(quantity, unit) {
  // 1. Convert to number in case a string like "500" is sent
  const qty = parseFloat(quantity);
  if (isNaN(qty)) return 0;

  // 2. Normalize unit string (removes spaces and makes it lowercase)
  const normalizedUnit = unit ? unit.toLowerCase().trim() : "";

  switch (normalizedUnit) {
    case "kg":
    case "ltr":
      return qty * 1000;

    case "gm":
    case "ml":
    case "pcs":
    case "unit":
      return qty;

    default:
      // If no unit matches, return the quantity as is
      return qty;
  }
}

module.exports = convertToBaseUnit;