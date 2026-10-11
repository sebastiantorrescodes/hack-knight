// Science words the plant uses (see the Teaching section of the agent's prompt), explained for kids.
// Replies stay plain text so they read aloud well; the chat finds these words and makes them tappable.
// `picture` is a little emoji scene, `words` are the forms to look for (lowercase).
export const GLOSSARY = [
  {
    title: "Photosynthesis",
    words: ["photosynthesis"],
    picture: "☀️ + 💧 + 💨 → 🍃",
    text: "How plants make their own food! Leaves mix sunlight, water and air together to make sugar, and give off oxygen.",
  },
  {
    title: "Chlorophyll",
    words: ["chlorophyll"],
    picture: "🍃🟢",
    text: "The green stuff inside leaves. It catches sunlight like a tiny solar panel, and it's why leaves are green.",
  },
  {
    title: "Roots",
    words: ["roots", "root"],
    picture: "🌱⬇️💧",
    text: "The part of a plant under the soil. Roots drink water, hold the plant steady, and need air too!",
  },
  {
    title: "Oxygen",
    words: ["oxygen"],
    picture: "🍃 → 💨 → 🫁",
    text: "A gas in the air that people and animals need to breathe. Plants make it when they make food.",
  },
  {
    title: "Carbon dioxide",
    words: ["carbon dioxide"],
    picture: "🫁 → 💨 → 🍃",
    text: "A gas we breathe out. Plants breathe it in through their leaves and use it to make food.",
  },
  {
    title: "Evaporation",
    words: ["evaporation", "evaporate", "evaporates", "evaporating"],
    picture: "💧☀️ → ☁️",
    text: "When water warms up and turns into an invisible gas that floats into the air, like a puddle drying up.",
  },
  {
    title: "Transpiration",
    words: ["transpiration"],
    picture: "🍃 → 💧💨",
    text: "When water travels up from a plant's roots and floats out of tiny holes in its leaves. Plants kind of sweat!",
  },
  {
    title: "Stomata",
    words: ["stomata", "stoma"],
    picture: "🍃🔍👄",
    text: "Tiny holes on leaves, too small to see. Plants open them to breathe in air and let water out.",
  },
  {
    title: "Condensation",
    words: ["condensation"],
    picture: "💨❄️ → 💧",
    text: "When water in the air cools down and turns back into drops, like the water on a cold glass.",
  },
  {
    title: "Precipitation",
    words: ["precipitation"],
    picture: "☁️ → 🌧️🌨️",
    text: "Water falling from clouds: rain, snow, sleet or hail.",
  },
  {
    title: "The water cycle",
    words: ["water cycle"],
    picture: "🌊 → ☁️ → 🌧️ → 🌊",
    text: "Water's never-ending trip: it evaporates into the sky, makes clouds, falls as rain, and starts all over again.",
  },
  {
    title: "Humidity",
    words: ["humidity", "humid"],
    picture: "💨💧💧",
    text: "How much water is floating in the air. Humid air feels sticky; dry air makes plants thirsty faster.",
  },
  {
    title: "Nutrients",
    words: ["nutrients", "nutrient"],
    picture: "🪨✨🌱",
    text: "Plant vitamins! Tiny bits in the soil that roots soak up to help the plant grow strong.",
  },
  {
    title: "Germination",
    words: ["germination", "germinate"], // not "sprout": that's the default plant name
    picture: "🫘 → 🌱",
    text: "When a seed wakes up and starts to grow its first root and tiny leaves.",
  },
  {
    title: "Pollination",
    words: ["pollination", "pollen", "pollinate"],
    picture: "🌸 → 🐝 → 🌸",
    text: "When bees, butterflies or the wind carry pollen from flower to flower, so plants can make seeds and fruit.",
  },
];

const byWord = new Map(GLOSSARY.flatMap((entry) => entry.words.map((w) => [w, entry])));

// Longest words first, so "carbon dioxide" wins over anything shorter inside it
const PATTERN = new RegExp(
  `\\b(${[...byWord.keys()].sort((a, b) => b.length - a.length).map((w) => w.replace(/ /g, "\\s+")).join("|")})\\b`,
  "gi"
);

/**
 * Split text into plain strings and glossary matches ({ match, entry }). Only the first mention of each
 * entry is marked, so a reply that says "roots" three times gets one underline, not three.
 */
export function findTerms(text) {
  const pieces = [];
  const seen = new Set();
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    const entry = byWord.get(m[0].toLowerCase().replace(/\s+/g, " "));
    if (!entry || seen.has(entry)) continue;
    seen.add(entry);
    if (m.index > last) pieces.push(text.slice(last, m.index));
    pieces.push({ match: m[0], entry });
    last = m.index + m[0].length;
  }
  if (last < text.length) pieces.push(text.slice(last));
  return pieces;
}
