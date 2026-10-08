# AD-PathTracker

Interactive visualizer for mapping Active Directory environments during
HackTheBox, CTFs, or authorized exam/pentest engagements. Manually record
what you've enumerated (hosts, users, groups, domains, subnets, access
gained, credentials found) as a node graph, then ask Claude for the next
best attack vector based on exactly what's on the board.

## Stack

- React + TypeScript + Vite
- [@xyflow/react](https://reactflow.dev/) (React Flow) for the node/edge canvas
- Zustand (with localStorage persistence — your session survives a refresh)
- Tailwind CSS v4
- lucide-react for icons

## Running it

```bash
npm install
npm run dev
```

## Using it

- **Toolbar** (top): add Forest / Domain / Subnet / Domain Controller / Computer / User / Group nodes.
- **Canvas**: drag nodes to arrange; drag between the top/bottom handles to draw a directed, arrow-headed relationship between two objects (e.g. for lateral movement). Scroll to zoom, drag the pane to pan, minimap + fit-view controls included for large maps.
- **Subnets as boundaries**: a Subnet node renders as a large dashed container — resize it (select it, drag the corner handles) and drag hosts visually inside it to indicate network boundaries.
- **Node sidebar** (click a node): edit hostname, OS, access level, compromised flag, and for hosts:
  - **Multiple IPs** — add more than one and the node automatically gets a "MULTI-HOMED" badge.
  - **Services** — add port/service rows and flag any as "internal-only"; the node gets a "NEEDS PIVOT" badge so you know it needs port-forwarding to reach.
  - **NMAP output** — free-text field to paste raw scan output.
  - **Discovered Users** — paste a list (`username` or `username:password`/`hash`, one per line) and hit **Sync Users From List**: it automatically creates (or updates, if the username already exists) a User node per line and links it to that host with a "Discovered On" relationship — no manual node creation needed.
- **Edge sidebar** (click an arrow): set its relationship type (Lateral Movement, Admin To, Has Session, Member Of, Trusts, Discovered On, Custom — each with its own color) and a free-text note.
- **Export / Import** (top right): session saves to a JSON file you can reload later or share.
- **Ask Claude** (bottom right): chat panel that sends your current graph (every node's fields, every relationship and its type/note) plus your question to Claude and asks for the next best attack vector. Click the gear icon to add your own Anthropic API key — it's stored only in this browser's local storage and sent directly to Anthropic, nowhere else.

## Notes

- Everything persists to `localStorage` under the key `ad-pathtracker-session` — no backend, fully local.
- Node/edge data model lives in [src/types/entities.ts](src/types/entities.ts) — this is the place to extend if you add new entity types or fields later. The store's `persist` config has a `version`/`migrate` pair ([src/store/useGraphStore.ts](src/store/useGraphStore.ts)) — bump `version` and extend `migrate` whenever you change a node's data shape, or old saved sessions will fail to load.
