# Tanvi's Cupcake Rush

A cozy pixel cooking game made with Vite and Kaboom.js for the **Chain Reaction!** game jam. Think Papa's Cupcakeria meets Overcooked: customers line up with order tickets, and you run between stations to bake each cupcake before their patience runs out.

## Hands-on stations

The timed game now includes ingredient gathering (click or drag into the bowl), three stirs, batter dispensing, loading the oven, three frosting swirls, topping placement, and boxing with a ribbon. These close-ups use the selected order ingredients and commit to the same shift inventory when confirmed. Back/Escape cancels without applying an ingredient or awarding an item.

The shift timer, ovens, and customer patience continue during station activities, except the guided first order's existing clock/patience hold. Finishing a shift closes any unfinished activity. Both solo and Bake-Off use the same interactions.

## How it plays

- **Make cupcakes to order:** Ingredients → Oven → Frosting → Toppings → (Packaging for to-go) → Serving. Click a station to walk there and pick an action; keyboard shortcuts are optional.
- **Streaks:** serve customers back to back to build a streak. Every 3 in a row raises your score multiplier and cheers up the whole line. A customer who walks out breaks it.
- **Secret combos:** certain flavor + frosting + topping combinations are worth much more. "Surprise me!" customers take anything, so they're your chance to experiment.
- **Heat - the chain reaction:** stations heat up as you use them, especially Turbo bake. An overheated station jams and its heat cascades down the production line (modeled with DebtRank, the algorithm for contagion in financial networks). Cool stations down before the whole kitchen seizes up.
- **Five days:** hit each day's coin goal to open tomorrow, and spend coins in the shop on upgrades and new ingredients between days.
- **Bake-Off:** a two-player hot-seat mode. Same budget, same customers, highest score wins.

Day 1 starts with a guided first order, and pop-up tips explain each new thing the first time it happens.

## Accessibility

- Font size control that scales every piece of text in the game (100-150%)
- Colorblind-safe mode (Okabe-Ito palette) for every status color, ingredient, and badge; status is always shown with a symbol or text too
- Optional voice narrator (Web Speech API)
- Fully playable by mouse, touch, or keyboard; the game fits the screen with a 1200px maximum kitchen width and capped dialog sizing

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

- `src/main.js` wires the game together: flow between screens, settings, sound, and narration.
- `src/game/shift.js` is one day's game logic (customers, cupcakes, streaks, heat); `src/game/run.js` handles days, goals, and the shop. Both are pure JS - run `node src/game/shift.test.js`.
- `src/game/data.js` holds all the tuning: menu, combos, upgrades, and day difficulty.
- `src/game/scene.js` draws the kitchen, the baker, and the action animations on the Kaboom canvas.
- `src/game/ui.js`, `src/game/screens.js`, and `src/game/coach.js` are the HUD, the between-day screens, and the tutorial tips.
- `src/chainReaction.js` is the cascade engine behind in-game kitchen heat (`node src/chainReaction.test.js`).
- `src/narrator.js`, `src/audio.js`, and `src/character.js` are the narrator, sound, and baker customization.
- `src/style.css` and `src/game.css` are the styles.
- `src/constants.js` holds the canvas size and base colors.
- `src/kaboomCtx.js` configures Kaboom.

## Credits

The project structure was inspired by [2d-portfolio-kaboom](https://github.com/JSLegendDev/2d-portfolio-kaboom) by JSLegendDev.

| Use | Track | Creator |
| --- | --- | --- |
| Background music | Funny Cartoon Music | Maksym Malko |
| Cupcake into the oven, tossing | Water Splash | Freesound Community |
| Menus and cooling | Simple Whoosh | Dragon Studio |
| Baker customization | Button Press | Dragon Studio |
| Interface clicks | Mouse Click | Matthew Vakaliuk |
| Shift start | 8-Bit Arcade Video Game Start Sound Effect | Freesound Community |
| Customer walks out | Aww | Adhimahadi |
| Secret combo, saving your baker | Shine | Faith Mulato |
| Sprinkles | Salt Shaking | Freesound Community |
| Boxing to-go orders | Placing Cardboard Box | Oxidvideos |
| Serving a customer | Cartoon Eating Sound Effect | Betoelguapillo |
| New customers, toppings, overheating | Bubble Pop 06 | Universfield |
| Mixing batter and frosting | Slimy | Freesound Community |
| Streak bonus | Level Up 05 | Universfield |
| Closing time, shop purchases | Button Pressed | Freesound Community |
| Oven timer | Bell Ring | Dragon Studio |

Audio files are stored in `audio/`.
