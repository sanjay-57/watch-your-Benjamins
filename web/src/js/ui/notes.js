// Banknotes — the app's alternate looks (palettes live in css/notes.css).
// Category colours are stored as dollar inks; each note re-prints them in its own inks at render time.
import { DOLLAR_COLORS } from '../core/store.js';

// accents: the four slots in store (greenback · seal · jade · khaki), named and inked per note
// [slot, name, dark-mode rgb, light-mode rgb]
export const NOTES = {
  dollar: {
    name: 'Dollar', face: '$100', bg: 'linear-gradient(135deg,#2e7d4f,#123524 60%,#85bb65)', ink: '#f2f0e6',
    accents: [['greenback', 'greenback', '133 187 101', '31 90 58'], ['seal', 'seal', '111 196 132', '46 125 79'], ['jade', 'jade', '127 196 174', '47 111 94'], ['khaki', 'khaki', '215 199 138', '124 111 54']],
  },
  dirham: {
    name: 'Dirham', face: 'AED', bg: 'linear-gradient(135deg,#2f7fa8,#0b2a3a 60%,#d4b26a)', ink: '#f3eee2',
    accents: [['greenback', 'gulf blue', '111 176 214', '31 95 134'], ['seal', 'turquoise', '95 196 206', '26 122 138'], ['jade', 'desert gold', '218 186 116', '138 106 40'], ['khaki', 'rose', '226 140 150', '168 60 82']],
    inks: ['#4FB3C4', '#8FC3D6', '#D4B26A', '#3F86B5', '#9CC9CF', '#1F5F86', '#C09A55', '#5FA3A8', '#2E4F72', '#7FD3C8', '#C47A86', '#8FA3B0', '#CFE4EA', '#E6D3A8', '#8A6F45', '#7F8890'],
  },
  rupee: {
    name: 'Rupee', face: '₹500', bg: 'linear-gradient(135deg,#8f8b80,#2b2a26 60%,#3fae85)', ink: '#efede6',
    accents: [['greenback', 'shift green', '124 207 165', '31 122 85'], ['seal', 'shift blue', '134 177 224', '46 100 160'], ['jade', 'red fort', '222 140 110', '160 72 48'], ['khaki', 'saffron', '226 180 94', '143 101 22']],
    inks: ['#7CCFA5', '#A9C79A', '#D9A24A', '#3D7FC4', '#9BB8D6', '#2A8A66', '#B5654A', '#5FAF9A', '#3E5F7A', '#A3D98A', '#8F8B80', '#9C9788', '#DCD8CE', '#E3C79A', '#7D6A48', '#7E7D78'],
  },
};

export const currentNote = () => NOTES[document.documentElement.dataset.note] || NOTES.dollar;

/** A stored (dollar) category colour, re-inked for the current note. */
export function noteInk(hex) {
  const inks = currentNote().inks;
  if (!inks || !hex) return hex;
  const i = DOLLAR_COLORS.indexOf(hex.toUpperCase());
  return i < 0 ? hex : inks[i];
}
