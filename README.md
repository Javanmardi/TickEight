# Tick Eight 📚

A spaced repetition vocabulary learning app built with React Native and Expo.
Inspired by the Leitner system — each word is reviewed for 8 consecutive days before being retired.

---

## How It Works

Each vocabulary list is divided into batches of 20 words. Every day you review that day's new batch plus all previous batches still in the 8-day cycle.

| Day | Batches Reviewed |
|-----|-----------------|
| Day 1 | Batch 1 |
| Day 2 | Batch 1 + Batch 2 |
| Day 3 | Batch 1 + Batch 2 + Batch 3 |
| ... | ... |
| Day 9 | Batch 2 → Batch 9 (Batch 1 retired) |

For each word you:
1. See the word
2. Think of the meaning
3. Reveal the answer
4. Mark it ✓ Correct or ✕ Wrong

Your history across all 8 days is shown as coloured dots on each word card.

---

## Features

- 📂 Multiple courses — create as many as you want
- 📄 CSV import — upload your own vocabulary files
- 💾 Persistent progress — each course remembers exactly where you are
- 📅 Auto day-advance — come back the next day and the app moves forward automatically
- 📊 History dots — see your performance across all 8 days per word

---

## CSV Format

Create a plain `.csv` file with one word per line, no header row:

```
Hund,dog
Katze,cat
laufen,to run
das Haus,the house
```

Save as UTF-8 encoding. Send it to your phone via any method (LocalSend, email, Google Drive) and import it in the app.

---

## Tech Stack

- [React Native](https://reactnative.dev/)
- [Expo](https://expo.dev/) SDK 54
- [AsyncStorage](https://react-native-async-storage.github.io/async-storage/) — local persistent storage
- [expo-document-picker](https://docs.expo.dev/versions/latest/sdk/document-picker/) — CSV file import
- [expo-file-system](https://docs.expo.dev/versions/latest/sdk/filesystem/) — file reading

---

## Getting Started

### Prerequisites
- Node.js (LTS)
- Expo CLI

### Installation

```bash
git clone https://github.com/yourusername/TickEight.git
cd TickEight
npm install
npx expo start
```

Scan the QR code with **Expo Go** on your Android phone to run the app instantly.

### Build APK

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build -p android --profile preview
```

---

## Project Structure

```
TickEight/
├── App.js          ← Entire application
├── app.json        ← Expo configuration
├── eas.json        ← EAS build configuration
├── package.json    ← Dependencies
├── assets/         ← Icons and splash screen
├── LICENSE
└── README.md
```

---

## License

GPL v3 © 2026 Behrouz

This project is free software — you can redistribute and modify it under the
terms of the GNU General Public License v3. Any derivative work must also be
open source under the same license.

See [LICENSE](./LICENSE) for full details.
