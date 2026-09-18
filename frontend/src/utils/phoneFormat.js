export function formatIndianPhone(input) {
  if (
    !input ||
    input === "+" ||
    input === "+9" ||
    input === "+91" ||
    input === "+91 "
  ) {
    return "";
  }

  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("91")) {
    digits = digits.slice(2);
  }
  digits = digits.slice(0, 10);

  if (!digits) return "";

  let formatted = "+91";
  if (digits.length <= 5) {
    formatted += ` ${digits}`;
  } else {
    formatted += ` ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return formatted;
}
