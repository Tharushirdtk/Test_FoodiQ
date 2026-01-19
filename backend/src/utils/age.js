// Utility to compute age from a date-like value
function getAgeFromDate(dateValue) {
  if (!dateValue) return null;
  const birth = new Date(dateValue);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

module.exports = { getAgeFromDate };
