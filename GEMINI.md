# Gemini Code Assistant Context

This document provides context for the Gemini Code Assistant to understand the codebase.

## Project Overview

This project is a VS Code extension called **JsonLens**. It provides an interactive visual navigation and analysis experience for JSON files directly within the editor.

The extension is built with TypeScript and uses a React-based webview for its user interface.

### Key Technologies

*   **VS Code API:** The core of the extension, interacting with the editor, documents, and UI.
*   **TypeScript:** The primary language for the extension's backend/main process.
*   **React:** Used for the interactive webview UI.
*   **esbuild:** For fast bundling of the extension and webview code.
*   **Vitest:** For running unit tests.

### Architecture

The extension has two main parts:

1.  **Extension Host Process (`src/`):**
    *   This is the main Node.js process for the extension.
    *   `extension.ts`: The entry point, responsible for activating the extension, registering commands, and creating the webview panel.
    *   `providers/`: Contains data providers for the tree views and custom editors.
    *   `core/`: Handles document loading, parsing, and management.
    *   `tree/`: Implements the logic for the JSON file and data tree views.

2.  **Webview UI (`webview-src/`):**
    *   This is the React application that runs inside the webview panel.
    *   `App.tsx`: The root component of the React application.
    *   `components/`: Contains the individual React components for the UI.
    *   `hooks/`: Contains React hooks for managing state and communication with the extension host.

## Building and Running

### Build

To build the extension and the webview:

```bash
npm run build
```

This command runs `esbuild` to bundle both the extension and webview code.

### Run

To run the extension in a new VS Code Extension Development Host window:

1.  Open the project in VS Code.
2.  Press `F5` to start debugging.

### Test

To run the unit tests:

```bash
npm run test
```

This command uses `vitest` to execute the tests.

## Development Conventions

*   **TypeScript:** The codebase is written in TypeScript. Follow existing coding styles and type conventions.
*   **React:** The webview UI is built with React. Use functional components and hooks.
*   **VS Code API:** Interactions with the VS Code editor are handled through the `vscode` module.
*   **State Management:** The webview uses a combination of React hooks and message passing to manage state and communicate with the extension host.
