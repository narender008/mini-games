# Toy Tanks: sources of the photographed assets

Every file in `assets/env/` and `assets/tex/` was made from the CC0 originals below (Poly Haven and ambientCG, CC0 1.0, no attribution required; authors are credited anyway). They were cropped, regraded, resized and re-encoded; the originals are not in this repository. Everything else in the game (tanks, props, scenery, effects and sound) is made in code or in the Blender scripts in `blender/`.

`assets/env/<stage>-light.png` is the stage's HDRI with the sun taken out, packed as RGBM; `<stage>-backdrop.webp` is a crop of the same HDRI for the sky. `assets/tex/<name>-{col,nrm,orm}.webp` are 1024 px tiling sets (colour, OpenGL normal, AO/roughness/height).

| Asset | Original | Author | Used for |
| --- | --- | --- | --- |
| HDRI [golden_gate_hills](https://polyhaven.com/a/golden_gate_hills) | 8k .hdr | Dimitrios Savva, Jarod Guest | meadow sky and light |
| HDRI [spiaggia_di_mondello](https://polyhaven.com/a/spiaggia_di_mondello) | 8k .hdr | Andreas Mischok | beach light (sky clouds from golden_gate_hills) |
| HDRI [whipple_creek_regional_park_01](https://polyhaven.com/a/whipple_creek_regional_park_01) | 8k .hdr | Philip Modin | garden sky and light |
| HDRI [lago_disola](https://polyhaven.com/a/lago_disola) | 8k .hdr | Andreas Mischok | snow sky and light, regraded to a sunset |
| HDRI [forest_slope](https://polyhaven.com/a/forest_slope) | 8k .hdr | Andreas Mischok | forest sky and light |
| [leafy_grass](https://polyhaven.com/a/leafy_grass) | 2k JPG | Charlotte Baglioni | `grass-soil` |
| [farm_soil](https://polyhaven.com/a/farm_soil) | 2k JPG | Amal Kumar | `soil` |
| [mossy_rock](https://polyhaven.com/a/mossy_rock) | 2k JPG | Rob Tuytel | `rock-moss` |
| [sand_03](https://polyhaven.com/a/sand_03) | 2k JPG | Charlotte Baglioni | `sand` |
| [damp_beach_sand](https://polyhaven.com/a/damp_beach_sand) | 2k JPG | Dimitrios Savva | `sand-wet` |
| [brown_mud_03](https://polyhaven.com/a/brown_mud_03) | 2k JPG | Rob Tuytel | `mud` |
| [rock_04](https://polyhaven.com/a/rock_04) | 2k JPG | Rob Tuytel | `rock` (desaturated) |
| [brown_planks_03](https://polyhaven.com/a/brown_planks_03) | 2k JPG | Rob Tuytel | `wood` |
| [pine_bark](https://polyhaven.com/a/pine_bark) | 2k JPG | Dimitrios Savva | `bark` |
| [Moss001](https://ambientcg.com/a/Moss001) | 1K JPG zip | ambientCG | `moss` |
| [Snow005](https://ambientcg.com/a/Snow005) | 1K JPG zip | ambientCG | `snow` |
| [Rope001](https://ambientcg.com/a/Rope001) | 1K JPG zip | ambientCG | `rope` |

All were downloaded on 2026-09-29. Exact download URLs and checksums of every original file:

```
HDRI golden_gate_hills (Golden Gate Hills; Dimitrios Savva (Photography), Jarod Guest (Processing))
  https://polyhaven.com/a/golden_gate_hills
  https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/8k/golden_gate_hills_8k.hdr
  8k .hdr, 98858253 bytes, downloaded 2026-09-29
  md5 1b3522f033e74cb14588e2164005c516
  sha256 fc4cc7dfa9a5647b898984a36c91c226471e53c1e15336ff11c01958dc5bac06
HDRI spiaggia_di_mondello (Spiaggia di Mondello; Andreas Mischok (All))
  https://polyhaven.com/a/spiaggia_di_mondello
  https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/8k/spiaggia_di_mondello_8k.hdr
  8k .hdr, 97193287 bytes, downloaded 2026-09-29
  md5 36577fb45e326e13232410cec8a8a2f7
  sha256 f382caa4aa81475a494149ec4806a658f2cebf461862e06e362f36923cca6bb6
HDRI whipple_creek_regional_park_01 (Whipple Creek Regional Park 01; Philip Modin (All))
  https://polyhaven.com/a/whipple_creek_regional_park_01
  https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/8k/whipple_creek_regional_park_01_8k.hdr
  8k .hdr, 112833291 bytes, downloaded 2026-09-29
  md5 fd26692b74e16f6e42968554ee98f08e
  sha256 c51a95ec24d1f6ad286cb27808031f2c7f46974d441a4a08af0a6898b0350ed5
HDRI lago_disola (Lago d'Isola; Andreas Mischok (All))
  https://polyhaven.com/a/lago_disola
  https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/8k/lago_disola_8k.hdr
  8k .hdr, 102817995 bytes, downloaded 2026-09-29
  md5 e04269c43d81dc6991ca846e6d416d3b
  sha256 d421ad88a91f56fdfd56b4116e65a5d12056314bb12539533f873443e2106747
HDRI forest_slope (Forest Slope; Andreas Mischok (All))
  https://polyhaven.com/a/forest_slope
  https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/8k/forest_slope_8k.hdr
  8k .hdr, 115433421 bytes, downloaded 2026-09-29
  md5 cd13e905e8a4f3b65eb44589b45e9903
  sha256 40a115a519f34af360e14c3dec9058cb9e567e9c5d87b52a6f2d12833d38517a
TEX grass-soil <- Poly Haven leafy_grass (Leafy Grass; Charlotte Baglioni)
  https://polyhaven.com/a/leafy_grass  2k JPG, downloaded 2026-09-29
    AO: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/leafy_grass/leafy_grass_ao_2k.jpg
      md5 f25065162a26693b29a10587582df688  sha256 bcce4368f6a1affe11b4a643e14cfed7dfb46abf6bb9e6a28a3b87c2de2ddb11
    Diffuse: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/leafy_grass/leafy_grass_diff_2k.jpg
      md5 8014f4dace676a62ed71b3dd76119dae  sha256 8e1c6d21365d4b89bc5a35ab664da98a78dbc3ab9ba6100474881c8619a5b113
    Displacement: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/leafy_grass/leafy_grass_disp_2k.jpg
      md5 9c0a5f6c375be590bda0c28e2c1dfa2a  sha256 de34be0f135a3c92fe6e55cca9501a4cc40e02e84de9cc4c7fefded1da5bd3f3
    Rough: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/leafy_grass/leafy_grass_rough_2k.jpg
      md5 b5c551ed91162aab5afbfb03b73ae3f5  sha256 34e1733bf4064b6950a575ff57e78c8b7ff71b63749eb48a49221bd65de6fb4f
    nor_gl: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/leafy_grass/leafy_grass_nor_gl_2k.jpg
      md5 ea5e91abe01dc5e5d7028c68c3bc9194  sha256 df0cf0ce96e653f033e5b934d5b12995464bda027aa53bd12e329be889aa9f45
TEX soil <- Poly Haven farm_soil (Farm Soil; Amal Kumar)
  https://polyhaven.com/a/farm_soil  2k JPG, downloaded 2026-09-29
    AO: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/farm_soil/farm_soil_ao_2k.jpg
      md5 be8e76775156e0c5ea8dd6fd23b17b0e  sha256 6e385bb69e745cf5b0ea10a220d3bc35765f38dfed4267d53eaa3c433bd9629a
    Diffuse: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/farm_soil/farm_soil_diff_2k.jpg
      md5 e3e04001c421396999827980615096b0  sha256 c86b4e3e86218fb06efb69691a7fe25a61dab82fb0967542b33fbd5cacc5ddc0
    Displacement: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/farm_soil/farm_soil_disp_2k.jpg
      md5 fa76120863c176194f21c4f97ecb049d  sha256 f277195afc454eeecdcd9da51486defdc7a6021828dee0a8ee430c456c1701b6
    Rough: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/farm_soil/farm_soil_rough_2k.jpg
      md5 b870e093597d80cf36fe4532943f3a62  sha256 f12bb70c420b1bbbf630c7b1b509371be43ff2418f131af1e2607a39dc181cb7
    nor_gl: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/farm_soil/farm_soil_nor_gl_2k.jpg
      md5 8401c6563fdfc601c118aecda0db0239  sha256 cfbf20c26de00d3e09a1546803b4f0a71a4d78938e4f1e1eeb37c049249e1240
TEX rock-moss <- Poly Haven mossy_rock (Mossy Rock; Rob Tuytel)
  https://polyhaven.com/a/mossy_rock  2k JPG, downloaded 2026-09-29
    AO: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/mossy_rock/mossy_rock_ao_2k.jpg
      md5 97386b4837e6d1a4782b10bc76f2dba5  sha256 7ced8b235f6e1c8dc537aa55fdb1990189fe0a30ea70edfa954f61043347053e
    Diffuse: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/mossy_rock/mossy_rock_diff_2k.jpg
      md5 8e55bbeeef1db0d2d0cae85515812c46  sha256 98ecbd1d19953433f5909b79958992b1da2b45addbee772d1d4c27287f368499
    Displacement: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/mossy_rock/mossy_rock_disp_2k.jpg
      md5 d22857010ae3d07e42c5548126cf386c  sha256 cc9a0ef96a0912c93fc8447f9a702a00fe3c442c36ed5999dbac5f7013ac5dde
    Rough: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/mossy_rock/mossy_rock_rough_2k.jpg
      md5 0b4bbecd6af36e343d05ed11914bb18f  sha256 341c4f85e9b350738d30e82e616177316cc5fcbc3e8b5ee9777db47dfc5e6b7a
    nor_gl: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/mossy_rock/mossy_rock_nor_gl_2k.jpg
      md5 e6b611c8a6f8e3276e7f5491c8e66a0f  sha256 78c05b52eb78617fcce4fde7a9ac4872a9725fb2d13aff33248cbdb9c6330563
TEX sand <- Poly Haven sand_03 (Sand 03; Charlotte Baglioni)
  https://polyhaven.com/a/sand_03  2k JPG, downloaded 2026-09-29
    AO: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/sand_03/sand_03_ao_2k.jpg
      md5 f748850fbc4dd9dc088b2642b194f9df  sha256 c9de7d0fc60f1a0f1e1b8b603520ae4539c6d63a397f1cdfb93fa9e4178bf0ae
    Diffuse: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/sand_03/sand_03_diff_2k.jpg
      md5 7732acef12dc23c8f7eda65f5cea0ab6  sha256 538453033d28a64c671b89389a6ee904184af18d365adb5a15d5ea9e1eb5705b
    Displacement: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/sand_03/sand_03_disp_2k.jpg
      md5 7d7fe51a218c302e6005282617d849e0  sha256 72f008ce9419c492b5936442d30b317d24c0fa2d446a55a753131446f9503f56
    Rough: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/sand_03/sand_03_rough_2k.jpg
      md5 7ee62cdf779c0fb37a5db58af5f3522e  sha256 f42030a395cf54fee47e8d2f36c9c0d3600a61564c12f728497da3e21b17a381
    nor_gl: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/sand_03/sand_03_nor_gl_2k.jpg
      md5 c87f87cc0cdf6c88fdc227b119f8a77b  sha256 ce870ef363010e0b96faa47f3fac47982cdbb40e3a59c0fe23fa64f587f54c7f
TEX sand-wet <- Poly Haven damp_beach_sand (Damp Beach Sand; Dimitrios Savva)
  https://polyhaven.com/a/damp_beach_sand  2k JPG, downloaded 2026-09-29
    AO: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/damp_beach_sand/damp_beach_sand_ao_2k.jpg
      md5 c9720222052b9a8eb2ff4debda1dbb4a  sha256 193ae4da0fab969339b0b154c64e7d84e3494ed7280fcd3b4bfb7ecbe555fd92
    Diffuse: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/damp_beach_sand/damp_beach_sand_diff_2k.jpg
      md5 87e71069e2d6210ef300464550e81efe  sha256 d87190deb69254dea4722cb5a017b98f3e022185a9d67ddb53d1576e5416ddf8
    Displacement: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/damp_beach_sand/damp_beach_sand_disp_2k.jpg
      md5 da4996c1b6a2b097e6d7d7fc31c2043f  sha256 5df930cbbc00815a7b55320a034d7d486fa4f7be1801b714214327832162fb7b
    Rough: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/damp_beach_sand/damp_beach_sand_rough_2k.jpg
      md5 2a24e7babac1c1b61adadf76ebd92803  sha256 9b96ef8971f7899dcaaa371b058eb6a855d2018ce4c73c03d309d2e457564d69
    nor_gl: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/damp_beach_sand/damp_beach_sand_nor_gl_2k.jpg
      md5 f33f2bb7017bbda819088f000f5d3aad  sha256 ca664b7737f4c75093300407df6f2b0f476f577ac3bce2c7f013760e50269efa
TEX mud <- Poly Haven brown_mud_03 (Brown Mud 03; Rob Tuytel)
  https://polyhaven.com/a/brown_mud_03  2k JPG, downloaded 2026-09-29
    AO: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/brown_mud_03/brown_mud_03_ao_2k.jpg
      md5 065617773e6ec358090bb71a82bb9374  sha256 4ac0ed146a261a00fb6007844841395962304b7382e37c7ed2ca90d1b184d4a4
    Diffuse: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/brown_mud_03/brown_mud_03_diff_2k.jpg
      md5 c3eabb7f0e13ef63091d632c03228163  sha256 57a87dae26769677578ab53b8829fe9b1e4dfec1ae1726f2942ce99fc73f400b
    Displacement: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/brown_mud_03/brown_mud_03_disp_2k.jpg
      md5 16c32c178e70d043c4524a3383644197  sha256 295bc090d6c436a84fa2e3402f37b8637ea5c6478b71f6fe892d237ab33cd2f4
    Rough: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/brown_mud_03/brown_mud_03_rough_2k.jpg
      md5 71bb97f9fd2a9e13e6e568d553b82a66  sha256 d4beda6f00e1d0bd431360037569cb7807c38a4f3a5102c256f3c24a4bc0e860
    nor_gl: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/brown_mud_03/brown_mud_03_nor_gl_2k.jpg
      md5 dc36255da382749c33eba9288b1cab34  sha256 4d9ea1c9321618dbde7bdb2287fae85b646e4bd7b27c294a3475096d30b33880
TEX rock <- Poly Haven rock_04 (Rock 04; Rob Tuytel)
  https://polyhaven.com/a/rock_04  2k JPG, downloaded 2026-09-29
    AO: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/rock_04/rock_04_ao_2k.jpg
      md5 11942e95d550e711f8257aaa7b4e3dc4  sha256 b36ea1652d7f54f6645c559e17d0e84026887c36f4d131744f735f55e8107a41
    Diffuse: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/rock_04/rock_04_diff_2k.jpg
      md5 89573333315e9539188b94e5fdb4908d  sha256 c5956655dbc6dd7f72569ed318fdacd88b8efe1a7a9958d13e54a23397defef2
    Displacement: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/rock_04/rock_04_disp_2k.jpg
      md5 5ea9f00c30e3f9311b35694f64493edb  sha256 1ff8998a0a6d47f89ad830da434c74f73a9aec8781613e5c175b1c404cf06a2b
    Rough: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/rock_04/rock_04_rough_2k.jpg
      md5 4be21bcd3aa8d0153dae6ce561d4eae6  sha256 886f4f20829a650e748ae0151a6f7aa95912be73189545c2db5fd280a9d66fcd
    nor_gl: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/rock_04/rock_04_nor_gl_2k.jpg
      md5 224105d9a4730d1351459286065f2d5b  sha256 c2f299ad32c36f66a5ef1075d71f7143b5e2662fda1fb86a4dd964e5c1e252b2
TEX wood <- Poly Haven brown_planks_03 (Brown Planks 03; Rob Tuytel)
  https://polyhaven.com/a/brown_planks_03  2k JPG, downloaded 2026-09-29
    AO: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/brown_planks_03/brown_planks_03_ao_2k.jpg
      md5 13f1043f597114b56befbecd126271c5  sha256 277c6062a79d3feea329865efa1d755f5fa74143626345642d26565dea2869a9
    Diffuse: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/brown_planks_03/brown_planks_03_diff_2k.jpg
      md5 6b571a7ad07c745b34a1d93cb793a075  sha256 1140ceac531c2dfe2e714357e34cd81cce62878ced24fa711b87c4ca24416058
    Displacement: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/brown_planks_03/brown_planks_03_disp_2k.jpg
      md5 be7577458e3d6cbab4ddc5069d954cff  sha256 27a63c6c8a2bfabdfc1847ffe0d6bc7a9665af3e5d0ed4594f604673eeabcf61
    Rough: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/brown_planks_03/brown_planks_03_rough_2k.jpg
      md5 8477d7bce2b6812537fa93fab99ed4e7  sha256 cfb6bf6494d6487c56b2699a45d71966439bc2cc41b386b12a62451048f0172c
    nor_gl: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/brown_planks_03/brown_planks_03_nor_gl_2k.jpg
      md5 9755feb6ca7bef5ef01a4137dd55959b  sha256 4aa94e511dda5ed998194debaf6049806f44a0afd3b750168efcd7a35bc0ff4a
TEX bark <- Poly Haven pine_bark (Pine Bark; Dimitrios Savva)
  https://polyhaven.com/a/pine_bark  2k JPG, downloaded 2026-09-29
    AO: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/pine_bark/pine_bark_ao_2k.jpg
      md5 604da5925849b0270b7ec46c211d909d  sha256 c76f03e24de9f5bb826676b0c34bfa49e5d1ca240166a2811d2d3874d47d21bd
    Diffuse: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/pine_bark/pine_bark_diff_2k.jpg
      md5 d10980446d36a65a73081cf61bc84992  sha256 741f333ab9f8a0996d8a53905b5ac792fab77d7ccb8cac5fbaed8c99b9f6abd5
    Displacement: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/pine_bark/pine_bark_disp_2k.jpg
      md5 4f46a23fd05aed2f2c5ab948abb1e589  sha256 066b021e6192eb49019bde474bf55323d7f0f13706f32c308d96ac1dbcba7c3c
    Rough: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/pine_bark/pine_bark_rough_2k.jpg
      md5 9ea974ea3e298b30ee3b7a21ec05b566  sha256 a86618f6358a97410b15d226d0b3d52bb203aed8d9a29cfa355769b95df94d03
    nor_gl: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/pine_bark/pine_bark_nor_gl_2k.jpg
      md5 ee1de039967165665060653a0e12e571  sha256 e91d024441a698523472ef2001be2eade2f73005d798466c7acd3ec5d585667f
TEX moss <- ambientCG Moss001 (CC0 1.0)
  https://ambientcg.com/a/Moss001
  https://ambientcg.com/get?file=Moss001_1K-JPG.zip  (11020175 bytes, downloaded 2026-09-29)
  zip md5 57c0b14ff4fc27016072c78e54e050c7
  zip sha256 9caff8a76c050c551fa45bfba6794fbb9e9182194cc4440a8258badda750ce40
    Moss001_1K-JPG_AmbientOcclusion.jpg sha256 d743f3138deb6b7964ac64a30fbff31faf67b8302fa9876a36fe908158abb281
    Moss001_1K-JPG_Color.jpg sha256 cbea8a60833b60f8bdc3073e48ba9d3963efe35dc5cca9c4d47a5a6874c6f898
    Moss001_1K-JPG_Displacement.jpg sha256 2b304a1a79d196fdcea565ec28a283645c2982baec890b058fff8cf68c80b2fa
    Moss001_1K-JPG_NormalDX.jpg sha256 8fb33321b7e68466349bdad76af83371cef04aa36b1b023f24cd13e800bf7628
    Moss001_1K-JPG_NormalGL.jpg sha256 007cc53876eeca3a522d84e99a9495584fc15ce7e21f8b0e24dd266f2f7e591a
    Moss001_1K-JPG_Roughness.jpg sha256 87b6db5661b864bd47578171c171dbe0cbfbfb62a144302f50d432a45dc23e77
TEX snow <- ambientCG Snow005 (CC0 1.0)
  https://ambientcg.com/a/Snow005
  https://ambientcg.com/get?file=Snow005_1K-JPG.zip  (7239557 bytes, downloaded 2026-09-29)
  zip md5 8ef80a21ba14242269b9f8b86132f338
  zip sha256 ebf266890e826d40a14c929a14233327acd8145138232049d9bf2348ff94108a
    Snow005_1K-JPG_Color.jpg sha256 ce2b8dd703a19c7db6ffb82f8e9def923b9d5948b467d9f99f1a386fb8c0cfdd
    Snow005_1K-JPG_Displacement.jpg sha256 27be226f1330cc237098da441ae0bcfce24c045065ea2fb984df022f79835dbb
    Snow005_1K-JPG_NormalDX.jpg sha256 f15bab55bc79239642e98b2c8fd7b78445ddec717837e5e4c4c96c3c3f0d2556
    Snow005_1K-JPG_NormalGL.jpg sha256 6f9576ace3b98744bbbc9b7bd3b93de44ebc0094a108bbcf26c0c3db1f74dd2b
    Snow005_1K-JPG_Roughness.jpg sha256 95e0443e8a5868aa5f09ab1f5b2f116e5aba723c4540b04b34fb83b23e07facc
TEX rope <- ambientCG Rope001 (CC0 1.0)
  https://ambientcg.com/a/Rope001
  https://ambientcg.com/get?file=Rope001_1K-JPG.zip  (4226862 bytes, downloaded 2026-09-29)
  zip md5 6f8f7d38f57f184dfb239cc6905e6207
  zip sha256 0f4daf2c2720b9bd910369cab753090b0ad6560435526ec5aaab293bae5fdbfc
    Rope001_1K-JPG_Color.jpg sha256 ce37f5da3b4762a2264d2d9a7f133f7caf8809f42f1216da506301e84f212e97
    Rope001_1K-JPG_Displacement.jpg sha256 898609a67dd5ace9951885b38cc76ad458b6eac7ff6689ee020623af2feaf9fd
    Rope001_1K-JPG_Metalness.jpg sha256 2ecca5789f5263c440bacc93c04a8175ff3ec093d58c77e6593456b31e2dbcc7
    Rope001_1K-JPG_NormalDX.jpg sha256 e9eaac3192433a11c4bb38f068556db258daf0094b86f52b3b35d205cba2ab81
    Rope001_1K-JPG_NormalGL.jpg sha256 bf1e55638aa756bd2512b0f6ab9de2fb5ceb9fc5db159607cf6b872cca9bb7fc
    Rope001_1K-JPG_Roughness.jpg sha256 b7092a728f1ef9165d52afea65a6c96d9ce927ff1150073afd86263c43f92054
```
