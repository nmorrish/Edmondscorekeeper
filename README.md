# Eric Edmonds Scoring System

A scoring system for HEMA Tournaments with the goal of having fighters focus fully on fighting.

Score and timekeeping is handled silently by judges around each ring and supervised by a score keeper. 
Scores are submitted online via the judge's phones and displayed on a central management interface.

Scoring criteria are:
 - Contact: 1 point
 - Target: 1 point
 - Control: 1 point
 - Afterblow: 1 point exclusively.
 - Self-call: 1 point exclusively.
 - Doubles: 0 points. 
 - Contact, Quality, and Control are summed for up to 3 point in total.

Each exchange will have scores averaged across all judges.

##Notes on data structure and terminology

-A Match between 2 fighters covers the whole 60 second fight from start to end.
-Each exchange within a match is scored after calling halt. There is no exchange limit. 
-Exchanges are referred to as bouts in the code and DB (might change this later)
-An Event encompasses all fights within a weapon category (longsword, rapier, mixed, etc) 
-Each event is split into rings.
-Matches are grouped by ring. 

## Implemented Features

- [x] Database for storing scores and fighters.
- [x] Asynchronous updates to page information.
- [x] Adding and listing fighters
- [x] Match fighters, specifying colors, ring, and event
- [x] SSE system allowing judges to see scorecard when signal to start scoring is given from scorekeeper.
- [x] Function for giving strikes to fighters.
- [x] Table view to display scores and calculate totals for each match
- [x] Function for calculating average score across all judge submissions for one bout
- [x] Function for resending Judgement signal in case judges have not received it.
- [x] Swap fighters inside matches using drop down lists.
- [x] Integrate a match timer with button for signalling start of Judgement.
- [x] Optimizations to ensure SSE will attempt to reconnect if an error occurs.
- [x] Feature for tracking when a match is completed, pending, and in-progress
- [x] Fallback in case SSE cannot function properly.
- [x] Toast for display of successful submissions to scorekeeper table.
- [x] Feature for handling multiple Events and Rings.
- [x] Data validation for Judgement entry form.
- [x] Show totals in Match headings with green text indicating winner.

## Planned Features

- [ ] Bracketing function that is compatible with multiple systems and auto-matches fighters.
- [ ] Create at least pools and single-elimination brackets.
- [ ] Optimizations for seamless addition and removal of fighters from pools.
- [ ] Optimizations for seamless addition and removal of fighters for active events.
- [ ] Delete function for Fighters, Matches, Bouts.
- [ ] UI functionality for adding and deleting Events and Event Rings.
- [ ] Button for quickly swapping fighter colors.
- [ ] Function to adjust score from score table.
- [ ] Separate view showing brackets and final scores for everyone not judging/scorekeeping.
- [ ] Secure connections to sensitive areas of scoring system to prevent snooping.
- [ ] Emergency JSON import/export feature for quick transition to backup servers.

---


### Dependencies
- Node.js `18.17.1`
- npm `10.8.2`
- PHP `8.3.6`

### 🔧 Installation
Ensure you have installed a version of Node.js, npm, and PHP compatible with the dependencies listed above.

#### Windows
```bash
# Clone the repository
git clone https://github.com/yourusername/match-management-system.git
cd match-management-system

# Install frontend dependencies
npm install

# Start React frontend (dev mode)
npm run dev

# Configure PHP backend in Apache or XAMPP
# Ensure MariaDB is running and credentials are set in your PHP scripts

#### macOS / Linux
# Clone the repository
git clone https://github.com/yourusername/match-management-system.git
cd match-management-system

# Install dependencies
npm install

# Start development server
npm run dev

# Set up Apache or Nginx to serve PHP files
# Ensure MySQL, MariaDB, etc service is active and configured, with correct credentials on connect.php





















# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type aware lint rules:

- Configure the top-level `parserOptions` property like this:

```js
export default {
  // other rules...
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: ['./tsconfig.json', './tsconfig.node.json', './tsconfig.app.json'],
    tsconfigRootDir: __dirname,
  },
}
```

- Replace `plugin:@typescript-eslint/recommended` to `plugin:@typescript-eslint/recommended-type-checked` or `plugin:@typescript-eslint/strict-type-checked`
- Optionally add `plugin:@typescript-eslint/stylistic-type-checked`
- Install [eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react) and add `plugin:react/recommended` & `plugin:react/jsx-runtime` to the `extends` list
