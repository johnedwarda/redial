# reDial

The phone app, rethought for one thumb: recents, favourites, search and the keypad in one view.

This repo publishes the interactive prototype from the reDial design canvas as a static site on
GitHub Pages (Settings → Pages → Deploy from a branch → `main` / `docs`).

- `docs/index.html` – the page: phone frame, back button, scaling
- `docs/prototype/Prototype.dc.html` – the prototype screen, copied from the design canvas
- `docs/dc-lite.js` – a small renderer that runs the canvas file with React
- `docs/blob/` – contact photos and textures used by the prototype

`?view=home|contacts|dialer|call` picks the starting screen.
