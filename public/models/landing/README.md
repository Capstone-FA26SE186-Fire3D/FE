# Landing character GLBs

Eighteen skinned bodies (one JPEG atlas each, T-pose, no animation) and `animations.glb` (PlayerMale skeleton with 13 clips).

- Bodies: `scripts/export_landing_cast.py`, run in a live Blender session. Game bodies come from the Unity project
  (`Unity/Assets/_Fire3D/Art/Characters`), landing-only bodies (four firefighters, four casual) from
  `artifacts/characters`; the script applies the same hand, palm and atlas repair the Unity bodies have.
- Clips: the Unity project records its own character states (`Tests/PlayMode/LandingClipBakeTests`, run with
  `FET3D_LANDING_CLIPS=<json>`), `scripts/build_landing_animations.py` turns the recording into `animations.glb`.
- At run time `scene/characters.ts` transfers each clip to a body in model space (bone axes differ between bodies) and
  keeps the body's own bone lengths.
