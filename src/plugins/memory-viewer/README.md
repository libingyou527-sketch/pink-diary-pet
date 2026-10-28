# dsh-pet-memory-viewer

A small DSH UI plugin that reads `~/.dsh/dsh-pet/memory.json` and shows its
conversation content in the Web/Desktop sidebar.

## What it adds

- A **记忆 / Memory** icon in the sidebar panel list (`sidebar.panellist`).
- Clicking it opens a full main-panel page (`main`, key `dsh-pet-memory`) with:
  - every remembered message (`content`) as a chat bubble,
  - role and timestamp,
  - local/QQ source badge when `message.source` is present,
  - image thumbnails for `message.images[]` (fetched on demand as base64 from
    dsh-pet's `/dsh-pet-7340/media` endpoint),
  - the file path and file mtime,
  - only the latest 10 messages initially; older messages load via
    `加载更早 / Load older`,
  - image thumbnails use IntersectionObserver, so off-screen images are not
    fetched until scrolled into view,
  - a manual refresh button plus a 5-second auto refresh,
  - a collapsible raw-JSON view,
  - a **chat composer** at the bottom that talks to the same dsh-pet
    conversation: Enter sends, Shift+Enter inserts a newline, 2000-character
    limit. The composer also accepts pasted images (`Ctrl+V`) and image files
    dropped onto the textarea, shows removable thumbnails, and can send an
    image-only message. The reply is written by dsh-pet into `memory.json` and
    appears in both this panel and the pet's own dialog.

## How it works

- `index.js` (Host) registers an exact HTTP route `/dsh-pet-memory` on the DSH
  web server and returns the parsed file as JSON. A missing or malformed file is
  reported as data (`ok: false`), never as a transport error.
- `client.js` (browser) registers the sidebar icon and the main panel. It
  fetches the route with a cache-busting query; the desktop shell forwards
  `dsh-app://app/*` requests to the Host with its authentication cookie.
- Sending a message posts `{ text }` to dsh-pet's own endpoint
  `POST /dsh-pet-7340/chat?pet=main&surface=any`; dsh-pet generates the reply,
  writes both turns into `~/.dsh/dsh-pet/memory.json`, and the panel reloads
  that file. Reading memory keeps working without dsh-pet; only sending
  requires it.
- `cordis.patch.yml` inserts the Host row; `dsh.client` in `package.json` makes
  the browser bundle load.

## Install

From the DSH profile:

```powershell
dsh plugin --profile desktop add "link:C:/Users/lby16/Documents/deepseek-harness/default-workspace/dsh-pet-memory-viewer"
```

The plugin manager's `install_bundle` action does the same from the UI. After a
restart (or a page reload) the sidebar shows the 记忆 icon.
