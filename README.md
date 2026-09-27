# Chain Reaction Bakery

A cozy pixel bakery game made with Vite and Kaboom.js for a game jam themed **Chain Reaction!**

One cupcake order sets off a chain reaction: every station's output powers the next, from the first egg to the final customer. Finish the chain, then break it on purpose in the **Chain Reaction Lab**, a small DebtRank-style contagion simulation where shocking one station cascades through the bakery's dependency graph. Score points for every station that goes critical, chase deeper chains, or play endless mode until the system collapses.

Accessibility: keyboard-operable station buttons, a colorblind-safe palette (with ✓ / ! / ✕ symbols on every node), a font size control, and an optional voice narrator.

## Development

```bash
npm install
npm run dev
```

Create or preview a production build with:

```bash
npm run build
npm run preview
```

## Structure

- `src/main.js` contains the bakery scene, interactions, state, and controls.
- `src/chainReaction.js` is the Chain Reaction Lab cascade engine and canvas renderer (tests: `node src/chainReaction.test.js`).
- `src/narrator.js` is the optional Web Speech narrator.
- `src/style.css` contains the interface and activity artwork.
- `src/constants.js` defines stations, quest steps, and the color palette.
- `src/kaboomCtx.js` configures Kaboom.
- `src/utils.js` contains shared scene helpers.

## Credits

The project structure was inspired by [2d-portfolio-kaboom](https://github.com/JSLegendDev/2d-portfolio-kaboom) by JSLegendDev.

| Use | Track | Creator |
| --- | --- | --- |
| Background music | Funny Cartoon Music | Maksym Malko |
| Placement | Water Splash | Freesound Community |
| Ingredient and option selection | Simple Whoosh | Dragon Studio |
| Character customization | Button Press | Dragon Studio |
| Interface controls | Mouse Click | Matthew Vakaliuk |
| Game start | 8-Bit Arcade Video Game Start Sound Effect | Freesound Community |
| Quick Links | Aww | Adhimahadi |
| Frosting and character completion | Shine | Faith Mulato |
| Sprinkles | Salt Shaking | Freesound Community |
| Packing | Placing Cardboard Box | Oxidvideos |
| Bow wrapping | Plastic Pop | Freesound Community |
| Customer delivery | Cartoon Eating Sound Effect | Betoelguapillo |
| Conveyor belt | Bicycle Wheel FX | Freesound Community |
| Batter dispenser | Bubble Pop 06 | Universfield |
| Batter mixing | Slimy | Freesound Community |
| Station completion | Level Up 05 | Universfield |
| Finish Quest | Button Pressed | Freesound Community |
| Baking | White Noise | Danevaer |
| Oven timer | Bell Ring | Dragon Studio |

Audio files are stored in `audio/`.
