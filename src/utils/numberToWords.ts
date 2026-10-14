/**
 * Converts a numeric amount to Indian Currency Words format.
 * Example: 252.50 -> "Rupees Two Hundred Fifty Two and Fifty Paise Only"
 * Example: 100000 -> "Rupees One Lakh Only"
 */

const ONES: string[] = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'
];

const TENS: string[] = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
];

function convertLessThanThousand(n: number): string {
  let str = '';
  if (n >= 100) {
    str += ONES[Math.floor(n / 100)] + ' Hundred ';
    n %= 100;
  }
  if (n >= 20) {
    str += TENS[Math.floor(n / 10)] + ' ';
    n %= 10;
  }
  if (n > 0) {
    str += ONES[n] + ' ';
  }
  return str.trim();
}

export function numberToIndianWords(amount: number): string {
  if (isNaN(amount) || amount === 0) {
    return 'Rupees Zero Only';
  }

  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  
  const rupees = Math.floor(absAmount);
  const paise = Math.round((absAmount - rupees) * 100);

  let result = '';

  // Crores (10^7)
  const crores = Math.floor(rupees / 10000000);
  let rem = rupees % 10000000;

  // Lakhs (10^5)
  const lakhs = Math.floor(rem / 100000);
  rem %= 100000;

  // Thousands (10^3)
  const thousands = Math.floor(rem / 1000);
  rem %= 1000;

  // Hundreds & Units (rem)
  const hundreds = rem;

  if (crores > 0) {
    result += convertLessThanThousand(crores) + ' Crore ';
  }
  if (lakhs > 0) {
    result += convertLessThanThousand(lakhs) + ' Lakh ';
  }
  if (thousands > 0) {
    result += convertLessThanThousand(thousands) + ' Thousand ';
  }
  if (hundreds > 0) {
    result += convertLessThanThousand(hundreds) + ' ';
  }

  result = result.trim();
  if (!result) {
    result = 'Zero';
  }

  let finalWords = 'Rupees ' + result;

  if (paise > 0) {
    finalWords += ' and ' + convertLessThanThousand(paise) + ' Paise';
  }

  finalWords += ' Only';

  if (isNegative) {
    finalWords = 'Minus ' + finalWords;
  }

  // Normalize multi-spaces
  return finalWords.replace(/\s+/g, ' ');
}
