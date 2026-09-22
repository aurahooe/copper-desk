const FEATURES = [
  {
    title: "Ink wash",
    headline: "Write like the lamp is the only thing still on.",
    editorial: "Short lines. No performance. The wall only keeps what you mark public.",
    note: "New this hour: softer hover on the wall, and the clock actually eats the remaining minutes."
  },
  {
    title: "Brass rule",
    headline: "One sentence that would survive a year in a drawer.",
    editorial: "If it only works as a caption, it is not ready for the mast.",
    note: "New this hour: public pieces from both desks land on the same wall."
  },
  {
    title: "Night edition",
    headline: "Leave something for the people still awake.",
    editorial: "Private drafts stay locked to your account. Public ones take the light.",
    note: "New this hour: sessions persist across reloads. Come back mid-sentence."
  },
  {
    title: "Column inch",
    headline: "Cut it until it can sit on a matchbox.",
    editorial: "The hour turns whether you are watching or not.",
    note: "New this hour: the ticker names the live feature instead of a slogan."
  },
  {
    title: "Proof pass",
    headline: "Read it once out loud. If you wince, it stays private.",
    editorial: "The desk is not a feed. It is a press with a lock on the drawer.",
    note: "New this hour: you can flip a piece public or private after you save it."
  },
  {
    title: "Late copy",
    headline: "The best line arrives after you thought you were done.",
    editorial: "Save the almost-right version in the drawer. Put the true one on the wall.",
    note: "New this hour: the mast pulls a featured public piece when one exists."
  }
];

export function hourCatalog(date = new Date()) {
  const i = (date.getUTCFullYear() * 366 + date.getUTCDate() * 24 + date.getUTCHours()) % FEATURES.length;
  return FEATURES[i];
}

export function slotKey(date = new Date()) {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}
