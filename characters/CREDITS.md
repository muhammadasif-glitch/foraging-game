# Credits of the characters

The characters of the game (characters/<name>.js, made by check/make_characters.py and check/make_rocketbox.py from these
files) and the library that draws them. Open licences only: MIT, CC BY 4.0 (credited here) and CC0.

## Models

- Girl, boy, woman and man (from 2.8.0): Microsoft Rocketbox Avatar Library, https://github.com/microsoft/Microsoft-Rocketbox,
  MIT licence, Copyright (c) 2020 Microsoft (characters/ROCKETBOX_LICENSE.txt): Female_Child_01, Male_Child_01,
  Female_Adult_17 and Male_Adult_16, made by check/make_rocketbox.py (in Blender, check/rocketbox_blend.py): the
  highest-detail mesh, textures made smaller, and the skin less shiny.
- Dog: "Animated Dog, Shiba Inu" by quander, https://sketchfab.com/3d-models/animated-dog-shiba-inu-9abfce885a834399b2c3ccaed51cd474, CC BY 4.0
- Robot: "Animated humanoid robot" by pinguinoconpulgares, https://sketchfab.com/3d-models/animated-humanoid-robot-8993602ca91f4c499e690e5dae19f978, CC BY 4.0

The dog and the robot were changed for the game: their materials made plain (metal and roughness), their
textures made smaller, their clips kept or made anew (below), drawn at a person's or a dog's height.
Until 2.7.1 the game also had a man, a woman and a knight from Sketchfab (CC BY 4.0: "Scanned animated walking
man" by 1-3D.com, "Realistic woman walking (animated)" by Jungle Jim, "Armored King" by Calviking073).

## How they move

- The girl, the boy, the woman and the man stand, walk and run with Rocketbox's own motion capture (MIT, as
  above): f_ and m_idle_neutral_01, f_ and m_walk_neutral_01, f_ and m_run_neutral_01. Every bone keeps its
  turn from its parent, as in the clips; the hips' motion is scaled to each body's hip height (the children's
  shorter legs), and the walk's and the run's travel over the floor is taken out (the game moves them). They
  eat with the bite of check/make_characters.py. check/body_check.py checks every frame: bones, feet and floor,
  knees, elbows, head, loops and the hand at the mouth.
- The robot walks and runs as people of the CMU Graphics Lab Motion Capture Database did (mocap.cs.cmu.edu; the
  database was created with funding from NSF EIA-0196217; free to use), as BVH files converted by Bruce Hahne
  (cgspeed), from github.com/Shriinivas/cmubvh: trials 07_01, 09_09; it stands with its own clip.
- The dog stands with its own clip; its trot and gallop are made in check/dog_gait.py.

## Sounds (CC0, from Freesound)

- "Step 1.wav" by carrigsound, https://freesound.org/people/carrigsound/sounds/32635/ (steps of the people)
- "Step 12.wav" by carrigsound, https://freesound.org/people/carrigsound/sounds/32638/ (steps of the people)
- "Step 2.wav" by carrigsound, https://freesound.org/people/carrigsound/sounds/32639/ (steps of the people)
- "Step 8.wav" by carrigsound, https://freesound.org/people/carrigsound/sounds/32645/ (steps of the people)
- "Hmm question.wav" by esperar, https://freesound.org/people/esperar/sounds/170768/ (woman and girl: voice)
- "OneHmm-question.wav" by esperar, https://freesound.org/people/esperar/sounds/170779/ (man, boy and the knight of 2.7.1: voice)
- "Bite (Apple)" by wadaltmon, https://freesound.org/people/wadaltmon/sounds/275015/ (eating, the people)
- "satisfiedSigh.wav" by garynoden, https://freesound.org/people/garynoden/sounds/334061/ (man, boy and the knight of 2.7.1: voice)
- "Crunch" by LilMati, https://freesound.org/people/LilMati/sounds/348112/ (eating, the people)
- "Chihuahua Puppy Whine" by AustinXYZ, https://freesound.org/people/AustinXYZ/sounds/350593/ (dog voice)
- "Knight Left Footstep on Gravel 3 (With Chainmail)" by Ali_6868, https://freesound.org/people/Ali_6868/sounds/384882/ (the knight of 2.7.1: steps)
- "Knight Left Footstep on Gravel 5 (With Chainmail)" by Ali_6868, https://freesound.org/people/Ali_6868/sounds/384884/ (the knight of 2.7.1: steps)
- "Knight Right Footstep on Gravel 1 (With Chainmail)" by Ali_6868, https://freesound.org/people/Ali_6868/sounds/384887/ (the knight of 2.7.1: steps)
- "Knight Right Footstep on Gravel 4 (With Chainmail)" by Ali_6868, https://freesound.org/people/Ali_6868/sounds/384888/ (the knight of 2.7.1: steps)
- "glitch_robot_2.flac" by hullum, https://freesound.org/people/hullum/sounds/415556/ (robot voice)
- "05-Hmm1.mp3" by lauracarolina09, https://freesound.org/people/lauracarolina09/sounds/445872/ (woman and girl: voice)
- "Dog Woofing Single 1.wav" by SpaceJoe, https://freesound.org/people/SpaceJoe/sounds/483184/ (dog voice)
- "Wood Floor Classic Shoe Footstep 1_12" by Joao_Janz, https://freesound.org/people/Joao_Janz/sounds/504018/ (steps of the people)
- "WoofBig2.wav" by Wdomino, https://freesound.org/people/Wdomino/sounds/517132/ (dog voice)
- "approving hm.wav" by trimono, https://freesound.org/people/trimono/sounds/519112/ (man, boy and the knight of 2.7.1: voice)
- "Single bark of a dog" by exe2be, https://freesound.org/people/exe2be/sounds/535457/ (dog voice)
- "UI Achievement Puzzle Game Application" by CogFireStudios, https://freesound.org/people/CogFireStudios/sounds/636656/ (robot voice)
- "droid beep 02" by rubberduck9999, https://freesound.org/people/rubberduck9999/sounds/676303/ (robot voice)
- "droid beep 03" by rubberduck9999, https://freesound.org/people/rubberduck9999/sounds/676304/ (robot voice)
- "Biting Food" by FaKexxChaos, https://freesound.org/people/FaKexxChaos/sounds/700417/ (eating: the dog and the people)
- "Big robot footstep 002" by AudioPapkin, https://freesound.org/people/AudioPapkin/sounds/813053/ (robot steps)
- "Big robot footstep 003" by AudioPapkin, https://freesound.org/people/AudioPapkin/sounds/813054/ (robot steps)
- "Chew Sound" by qubodup, https://freesound.org/people/qubodup/sounds/816236/ (eating: the dog and the people)
- "Dog Panting Loop" by qubodup, https://freesound.org/people/qubodup/sounds/827433/ (dog voice)
- "Dog Panting Loop 2" by qubodup, https://freesound.org/people/qubodup/sounds/841349/ (dog voice)

Each was cut to 1 step, bite or call and made as loud as the others of its kind.

## Library

- three.js r147, MIT licence (js/three/LICENSE), draws the characters.

The girl and the boy speak with the woman's and the man's recordings, played higher (js/sound.js).
Since 2.8.0 every footstep is half as loud.
