// loadfont.js

async function injectMyriadProFonts() {
  const fonts = [
    // Core family
    { weight: 300, style: "normal", file: "MyriadPro-Light.otf" },
    { weight: 400, style: "normal", file: "MYRIADPRO-REGULAR.OTF" },
    { weight: 600, style: "normal", file: "MYRIADPRO-SEMIBOLD.OTF" },
    { weight: 600, style: "italic", file: "MYRIADPRO-SEMIBOLDIT.OTF" },
    { weight: 700, style: "normal", file: "MYRIADPRO-BOLD.OTF" },
    { weight: 700, style: "italic", file: "MYRIADPRO-BOLDIT.OTF" },

    // Condensed faces (use font-stretch)
    {
      weight: 400,
      style: "normal",
      file: "MYRIADPRO-COND.OTF",
      stretch: "condensed",
    },
    {
      weight: 400,
      style: "italic",
      file: "MYRIADPRO-CONDIT.OTF",
      stretch: "condensed",
    },
    {
      weight: 700,
      style: "normal",
      file: "MYRIADPRO-BOLDCOND.OTF",
      stretch: "condensed",
    },
    {
      weight: 700,
      style: "italic",
      file: "MYRIADPRO-BOLDCONDIT.OTF",
      stretch: "condensed",
    },
  ];

  const rules = await Promise.all(
    fonts.map(async ({ weight, style, file, stretch }) => {
      const url = await chrome.runtime.getURL(`assets/fonts/Myriad/${file}`);
      return `
@font-face {
  font-family: 'Myriad Pro';
  src: url('${url}') format('opentype');
  font-weight: ${weight};
  font-style: ${style};
  ${stretch ? `font-stretch: ${stretch};` : ""}
  font-display: swap;
}
`.trim();
    })
  );

  const styleEl = document.createElement("style");
  styleEl.textContent = rules.join("\n");
  document.head.appendChild(styleEl);
}

injectMyriadProFonts();
