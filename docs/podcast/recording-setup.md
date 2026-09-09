# Podcast recording setup

One-time setup for the downstairs rig. After this, Sarah records with two
buttons and never opens a menu.

## Hardware

Plug everything into the Mac:

1. Monitor into the Mac.
2. Samson Q2U into a USB port. Use the USB cable, not XLR.
3. Stream Deck into a USB port.
4. Camera: iPhone on the desk mount with a USB cable, or a webcam on top
   of the monitor.
5. Put the Q2U on its stand, 4 to 6 inches from where Sarah's mouth will
   be. Point the top of the mic at her mouth.

## iPhone as camera (Continuity Camera)

The iPhone and the Mac must use the same Apple ID.

1. On the iPhone: Settings > General > AirPlay & Continuity. Turn on
   Continuity Camera.
2. Mount the phone in landscape, rear cameras facing Sarah, screen locked.
3. Test without OBS first: open Photo Booth on the Mac, open the Video
   menu, select the iPhone. If it shows up here, OBS will see it.
4. Make a Focus mode named "Recording" on the phone and turn it on before
   each session. A call during recording takes the camera away.

## OBS one-time setup

Install OBS from obsproject.com. Then:

1. **Audio.** Settings > Audio > Global Audio Devices. Set Mic/Auxiliary
   Audio to "Samson Q2U". Set every other audio device to Disabled.
2. **Recording.** Settings > Output > Recording. Format: Hybrid MP4.
   Encoder: Apple hardware (H.264). Settings > Video: 1920x1080, 30 fps.
   Set the recording path to the folder you want episodes to land in.
3. **Scene "FACE".** Add source > Video Capture Device > pick the iPhone
   (or webcam). Size it to fill the canvas.
4. **Scene "ARTICLE".** Add source > macOS Screen Capture. Pick the
   browser window that will show articles.
5. **Scene "BOTH".** Add the same screen capture. Add the camera source
   on top. Shrink the camera to the bottom-right corner.
6. **Mute the camera's microphone.** In the audio mixer, if the iPhone
   shows an audio meter, click its gear > Properties and disable its
   audio. Only the Q2U meter should move when Sarah talks.
7. **Launch at login.** System Settings > General > Login Items > add
   OBS. In OBS, General settings: enable "Start minimized to system tray".

## Stream Deck buttons

Install the Elgato software. Drag these actions from the OBS Studio group:

| Button | Action |
| --- | --- |
| 1: FACE | Scene: FACE |
| 2: ARTICLE | Scene: ARTICLE |
| 3: BOTH | Scene: BOTH |
| 4: RECORD | Toggle Record. The key shows red while recording. |
| 5: MUTE | Toggle mute on the Q2U |

Give each button a large text label.

## Q2U settings

1. Speak with lips about a hand-width from the mic.
2. Set the Mac input level once so speech peaks around the top of the
   yellow zone in the OBS mixer, never red. Mark the spot.
3. Leave the headphone jack free or use it to monitor. No settings needed.

## Sarah's card (print this part)

1. Sit down. Put the phone on the mount and click the cable in.
2. Press RECORD. The button turns red.
3. Talk. Press FACE, ARTICLE, or BOTH to change the view.
4. Press RECORD again to stop. Done.

If the camera does not show up: unplug the phone cable, plug it back in,
wait five seconds.
