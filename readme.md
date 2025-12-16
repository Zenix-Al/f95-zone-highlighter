# F95 Zone Highlighter

Level up your F95Zone experience with this all-in-one userscript powerhouse! Combines advanced thread highlighting, customizable overlays and tags, layout enhancements, auto latest page features, and seamless masked link skipping for faster downloads. Everything is highly configurable to match your vibe, preferred/excluded tags, colors, overlays, wide mode, and more.

## 📦 Requirements

- [Node.js](https://nodejs.org/) (LTS recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- A userscript manager in your browser, such as:
  - [Tampermonkey](https://www.tampermonkey.net/)
  - [Violentmonkey](https://violentmonkey.github.io/)

## ⚙️ Installation (Development Build)

1. Clone the repository:

   ```sh
   git clone git@github.com-zenix:Zenix-Al/f95-zone-highlighter.git
   cd f95-zone-highlighter

   ```

2. Install dependencies:

   ```sh
   npm install
   ```

3. Build the userscript:

   ```sh
   npm run build
   ```

   This will generate the compiled userscript in the `dist/` folder.

4. Open your userscript manager dashboard (e.g., Tampermonkey) and create a **new script**.

5. Copy the content of the built script (from `dist/f95-zone-highlighter.user.js`) and paste it into the new script editor.

6. Save and enable the script.

7. Visit [F95 Zone](https://f95zone.to) and verify the highlighter is working.

## 🔨 Development

- Run a rebuild on file changes:

  ```sh
  npm run dev
  ```

- Lint the code:

  ```sh
  npm run lint
  ```
