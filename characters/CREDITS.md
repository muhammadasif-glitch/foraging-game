# Credits of the characters

The characters of the game (characters/<name>.js, made by check/make_characters.py from these
files) and the library that draws them. Open licences only: CC BY 4.0 (credited here) and CC0.

## Models (CC BY 4.0)

Each was changed for the game: its materials made plain (metal and roughness), its textures made
smaller, parts that do not show taken off (the woman's mouth and eye moisture), its clips kept or
made anew (below) and it is drawn at a person's or a dog's height.

- Man: "Scanned animated walking man" by 1-3D.com, https://sketchfab.com/3d-models/scanned-animated-walking-man-bfbb95c3cb2b4e89a20d3d201b05045f, CC BY 4.0
- Woman: "Realistic woman walking (animated)" by Jungle Jim, https://sketchfab.com/3d-models/realistic-woman-walking-animated-d1ce2b8009b8401481408aeecea903d0, CC BY 4.0
- Dog: "Animated Dog, Shiba Inu" by quander, https://sketchfab.com/3d-models/animated-dog-shiba-inu-9abfce885a834399b2c3ccaed51cd474, CC BY 4.0
- Robot: "Animated humanoid robot" by pinguinoconpulgares, https://sketchfab.com/3d-models/animated-humanoid-robot-8993602ca91f4c499e690e5dae19f978, CC BY 4.0
- Knight: "Armored King" by Calviking073, https://sketchfab.com/3d-models/armored-king-e3978fb660cf47278485d44eeba488ef, CC BY 4.0

## How they move

- The man and the woman stand, walk and run, and the robot walks and runs (it stands with its own
  clip), as people of the CMU Graphics Lab Motion Capture Database did (mocap.cs.cmu.edu; the database was created with funding from NSF
  EIA-0196217; free to use), as BVH files converted by Bruce Hahne (cgspeed), from
  github.com/Shriinivas/cmubvh: trials 16_46, 35_01, 86_10, 91_29, 91_31.
- The knight walks and runs with its own clips, and stands as the man does.
- The dog stands with its own clip; its trot and gallop are made in check/dog_gait.py.

## Sounds (CC0, from Freesound)

- "Step 1.wav" by carrigsound, https://freesound.org/people/carrigsound/sounds/32635/ (man steps, woman steps)
- "Step 12.wav" by carrigsound, https://freesound.org/people/carrigsound/sounds/32638/ (man steps, woman steps)
- "Step 2.wav" by carrigsound, https://freesound.org/people/carrigsound/sounds/32639/ (man steps, woman steps)
- "Step 8.wav" by carrigsound, https://freesound.org/people/carrigsound/sounds/32645/ (man steps, woman steps)
- "Hmm question.wav" by esperar, https://freesound.org/people/esperar/sounds/170768/ (woman voice)
- "OneHmm-question.wav" by esperar, https://freesound.org/people/esperar/sounds/170779/ (knight voice, man voice)
- "Bite (Apple)" by wadaltmon, https://freesound.org/people/wadaltmon/sounds/275015/ (knight eating, man eating, woman eating)
- "satisfiedSigh.wav" by garynoden, https://freesound.org/people/garynoden/sounds/334061/ (knight voice, man voice)
- "Crunch" by LilMati, https://freesound.org/people/LilMati/sounds/348112/ (knight eating, man eating, woman eating)
- "Chihuahua Puppy Whine" by AustinXYZ, https://freesound.org/people/AustinXYZ/sounds/350593/ (dog voice)
- "Knight Left Footstep on Gravel 3 (With Chainmail)" by Ali_6868, https://freesound.org/people/Ali_6868/sounds/384882/ (knight steps)
- "Knight Left Footstep on Gravel 5 (With Chainmail)" by Ali_6868, https://freesound.org/people/Ali_6868/sounds/384884/ (knight steps)
- "Knight Right Footstep on Gravel 1 (With Chainmail)" by Ali_6868, https://freesound.org/people/Ali_6868/sounds/384887/ (knight steps)
- "Knight Right Footstep on Gravel 4 (With Chainmail)" by Ali_6868, https://freesound.org/people/Ali_6868/sounds/384888/ (knight steps)
- "glitch_robot_2.flac" by hullum, https://freesound.org/people/hullum/sounds/415556/ (robot voice)
- "05-Hmm1.mp3" by lauracarolina09, https://freesound.org/people/lauracarolina09/sounds/445872/ (woman voice)
- "Dog Woofing Single 1.wav" by SpaceJoe, https://freesound.org/people/SpaceJoe/sounds/483184/ (dog voice)
- "Wood Floor Classic Shoe Footstep 1_12" by Joao_Janz, https://freesound.org/people/Joao_Janz/sounds/504018/ (man steps, woman steps)
- "WoofBig2.wav" by Wdomino, https://freesound.org/people/Wdomino/sounds/517132/ (dog voice)
- "approving hm.wav" by trimono, https://freesound.org/people/trimono/sounds/519112/ (knight voice, man voice)
- "Single bark of a dog" by exe2be, https://freesound.org/people/exe2be/sounds/535457/ (dog voice)
- "UI Achievement Puzzle Game Application" by CogFireStudios, https://freesound.org/people/CogFireStudios/sounds/636656/ (robot voice)
- "droid beep 02" by rubberduck9999, https://freesound.org/people/rubberduck9999/sounds/676303/ (robot voice)
- "droid beep 03" by rubberduck9999, https://freesound.org/people/rubberduck9999/sounds/676304/ (robot voice)
- "Biting Food" by FaKexxChaos, https://freesound.org/people/FaKexxChaos/sounds/700417/ (dog eating, knight eating, man eating, woman eating)
- "Big robot footstep 002" by AudioPapkin, https://freesound.org/people/AudioPapkin/sounds/813053/ (robot steps)
- "Big robot footstep 003" by AudioPapkin, https://freesound.org/people/AudioPapkin/sounds/813054/ (robot steps)
- "Chew Sound" by qubodup, https://freesound.org/people/qubodup/sounds/816236/ (dog eating, knight eating, man eating, woman eating)
- "Dog Panting Loop" by qubodup, https://freesound.org/people/qubodup/sounds/827433/ (dog voice)
- "Dog Panting Loop 2" by qubodup, https://freesound.org/people/qubodup/sounds/841349/ (dog voice)

Each was cut to 1 step, bite or call and made as loud as the others of its kind.

## Library

- three.js r147, MIT licence (js/three/LICENSE), draws the characters.
