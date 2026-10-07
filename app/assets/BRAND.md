# ScamGraph AI reference branding

Reference: the user's `ScamGraph AI.png` brand board, supplied 6 October 2026. It contains an S ribbon, network nodes, a shield/check, light/dark icon examples and the phrase “SEE THE CONNECTIONS, STOP THE SCAM”. Captions are reference content, not additional app instructions.

The app uses a reference-derived raster symbol made with the built-in ImageGen tool, plus code-native UI. This is a generated interpretation, not an exact pixel extraction or editable vector original. Symbol alpha is preserved and the store icon is opaque. All assets are local.

`scamgraph-symbol.png` and `scamgraph-icon-master.png` are the generated masters. `scamgraph-symbol-ui.png` is a 384px Expo-exported UI asset (about 94 KB), `icon.png` is the opaque 1024px store icon, `adaptive-icon.png` is the 1024px transparent foreground, and `favicon.png` is the 128px browser source.

Size/format export: run `node scripts/export_brand_assets.cjs` after `npm ci` in `app/`. Expo's icon pipeline preserves the logo design. It replaces the provisional shield geometry.

Palette: midnight navy `#050B18`, purple `#6947E3`, violet `#AD9BFF`, with blue/cyan in the logo. Light mode uses white cards on `#F5F6FD`. Risk colors retain their meaning.

`scamgraph-icon-dark-master.png` and exported `icon-dark.png` provide the iOS dark-appearance icon; older OS versions use the light icon. `app.json` declares both variants.

## Built-in ImageGen prompt 1 — transparent symbol

Use case: background-extraction. Asset type: production ScamGraph AI mobile and web logo symbol. Input image 1 is the user's exact brand reference board. Isolate ONLY the large S ribbon + graph connections + small shield check symbol shown inside the large upper-left icon on that board. Preserve its recognizable design faithfully: flowing dimensional S ribbon with purple/violet to vivid blue and luminous cyan gradient; network has the upper white node, right cyan spherical node and lower-left violet node connected in a diamond; small blue-violet shield with cyan check at lower right. Preserve relative positions and smooth premium 3D lighting and crisp edges. Remove the rounded-square icon container, its border, the black/navy background and EVERY word or caption and every other copy of the icon. Do not redesign the S, do not add any text, no watermark. Single centered isolated S+graph+shield symbol on true alpha-transparent canvas, use generous even padding around complete mark, high resolution square asset suitable for app interface and app icon export. This is a precise faithful cutout from the main large reference illustration, not a contact sheet.

## Built-in ImageGen prompt 2 — opaque icon

Use case: compositing. Asset type: ScamGraph AI iOS/Android app store icon. Input image is the approved S-network-shield symbol. Preserve the EXACT visible S ribbon and graph/shield symbol, its positions, purple-blue-cyan gradients, geometry and highlights unchanged. Place the complete symbol centered on a clean solid opaque white square canvas. The mark fills about 72% of canvas height with balanced blank padding on all four sides. No text, no captions, no extra shapes, no outer frame or rounded-square outline, no watermark, no transparent pixels: the operating system will supply its own rounded corners. High quality square 1024x1024 application icon. Only change canvas/background and scale; retain the same brand mark.

## Built-in ImageGen prompt 3 — dark icon

Use case: compositing. Make the dark-mode native app icon counterpart of the supplied ScamGraph AI S-network-shield logo. Keep the existing symbol unchanged in identity, shape, relative layout and violet-blue-cyan glossy lighting. Center the complete symbol on a solid opaque very dark midnight navy square canvas (#050B18), at about 74% of the canvas height with balanced padding. Subtle violet/cyan glow around the symbol is allowed as in the user's dark reference. No lettering, no caption, no outside border, no rounded-square container (OS masks corners), no extra elements, no watermark. Square application icon at 1024x1024 intended for iOS dark appearance. Retain the exact S, three network nodes and shield check arrangement.
