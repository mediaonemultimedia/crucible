# DOWN HILL: Stage 2 of 2 (Kevin-approved, Sat Nov 21)
- **Repo:** https://github.com/mediaonemultimedia/crucible
- **Branch:** `kart-source`, in `down-hill/_source/`.
- **Read first:** `docs/stage-1.md` and the README status table. Every rule there (originality, performance, PUSH EARLY, quality bar, shipping) applies here too.

## 0. Finish stage 1
If any stage 1 item is unfinished or its PR wasn't merged, finish and ship that FIRST, then continue.

## 1. Phone controllers (up to 4 phones)
- **Port from PF2:** copy the pad from `pillow-fight-2/_source/src/pad/` (QR pairing, wire, padlink, pad, skins, wake lock, reconnect, haptics).
- **Backgrounds:** use Kevin's 14 painted backgrounds from `pillow-fight-2/_source/docs/friday-nov20/backgrounds/`. Ship them in `down-hill/controller/backgrounds/`.
- **Same layout:** keep the identical layout and drawing code; just remap the buttons:
  - STICK = steer
  - Six buttons: GAS, DRIFT, ITEM, BRAKE, LOOK BACK, TAUNT
  - SUPER pill = use item
  - MOVES tab = a cardboard "how to race" sheet listing the items
- **Hold to accelerate:** GAS is held (a toggle-able "auto-gas" in the sheet helps phone players).
- **Haptics:** buzz when you're hit by an item.
- **Tilt-to-steer (Kevin's request).** Steering on each phone has two options, chosen on the phone's select screen and in the sheet:
  - **STICK** (the default)
  - **TILT**: hold the phone landscape like a steering wheel and steer with the gyro (`DeviceOrientationEvent`). Use roll relative to a calibrated centre, with a small dead zone, a sensitivity slider (3 steps), smoothing, and a "re-centre" tap.
  - **iPhone:** `DeviceOrientationEvent.requestPermission()` must be called from a tap. Show a "Tap to enable tilt" button, and fall back to STICK if it's denied or unsupported.
  - **In TILT mode:** hide the stick and show a small tilting wheel icon in its place. The six buttons work the same.
  - **Send the steering value** in the existing wire packet (the stick-X byte), so the game side doesn't change.
  - **Test it** in the headless pad test with simulated orientation events.
- **Seats:** up to 4 phones; each picks a fighter and OG/ALT on their own phone.

## 2. Split screen for 2 to 4 local players
- Each screen gets its own camera and HUD; CPUs fill the field up to 8.
- Keyboard player 2 uses the other half of the keyboard. Gamepads and phones mix freely.
- **Performance:** check the frame cost with 4 views. Lower the LOD and shadows per view as needed to hold 60 fps, and report the numbers.

## 3. Two more tracks, plus "The Pillow Cup" (3 races, points, overall podium)
- **"Laundry Day":** the basement laundry room. Ride on a moving conveyor of folded towels, dodge rolling detergent pods, take a shortcut through a dryer drum that spins you around, and kick through sock piles.
- **"Sprinkler Park":** the backyard at golden hour. Lawn sprinklers knock you sideways, there's a garden-hose jump, a kiddie-pool splash zone, and a treehouse ramp.
- Each gets the same visual bar as The Landing.

## 4. Polish, if there's time
- A ghost replay of your best lap per track.
- A photo-finish slow-mo.
- A results screen roast for last place, in the existing trash-talk tone.

## Shipping
- Create `kart-release-2` off `main`. It touches ONLY `down-hill/index.html` and `down-hill/controller/`.
- Auto-merge your own PR only if the quality bar passes, plus headless tests with 4 simulated phones in sync. Then confirm the Pages deploy.
- Never push to `main`, never force-push, no self-scheduled follow-ups and no polling.
