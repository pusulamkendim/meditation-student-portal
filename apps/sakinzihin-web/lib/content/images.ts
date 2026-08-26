import heroAsset from '../../public/images/scene-01-lake-mist.png';
import forestPathAsset from '../../public/images/scene-02-forest-path.png';
import lakeGoldenAsset from '../../public/images/scene-03-lake-golden.png';
import lakeSunriseAsset from '../../public/images/scene-04-lake-sunrise.png';
import stoneBranchAsset from '../../public/images/scene-05-stone-branch.png';
import quietRoomAsset from '../../public/images/scene-06-quiet-room.png';
import forestLightAsset from '../../public/images/scene-07-forest-light.png';
import lakeReflectionAsset from '../../public/images/scene-08-lake-reflection.png';
import mountainLakeAsset from '../../public/images/scene-09-mountain-lake.png';
import mountainLakeWideAsset from '../../public/images/scene-10-mountain-lake-wide.png';
import aboutMeAsset from '../../public/images/aboutme.png';
import practicePortraitAsset from '../../public/images/me2.jpg';
import practiceBackdropAsset from '../../public/images/me4.jpg';

export type ImageKey =
  | 'hero'
  | 'forestPath'
  | 'forestLight'
  | 'lakeGolden'
  | 'lakeSunrise'
  | 'lakeReflection'
  | 'mountainLake'
  | 'stoneBranch'
  | 'quietRoom'
  | 'mountainLakeWide'
  | 'aboutMe'
  | 'practicePortrait'
  | 'practiceBackdrop';

export interface EditorialImage {
  src: string;
  alt: string;
}

export const imageRegistry: Record<ImageKey, EditorialImage> = {
  hero: {
    src: heroAsset.src,
    alt: 'Sabah ışığında sisli bir göl ve ormanlar',
  },
  forestPath: {
    src: forestPathAsset.src,
    alt: 'Ağaçların arasından ilerleyen sakin bir orman yolu',
  },
  lakeGolden: {
    src: lakeGoldenAsset.src,
    alt: 'Gün ışığını yansıtan sakin bir göl',
  },
  lakeSunrise: {
    src: lakeSunriseAsset.src,
    alt: 'Gün doğumunda göl kıyısı ve dağlar',
  },
  stoneBranch: {
    src: stoneBranchAsset.src,
    alt: 'Taş ve zeytin dalıyla sade bir doğa kompozisyonu',
  },
  quietRoom: {
    src: quietRoomAsset.src,
    alt: 'Gün ışığı alan sade ve sakin bir oda',
  },
  forestLight: {
    src: forestLightAsset.src,
    alt: 'Güneş ışığının süzüldüğü yeşil bir orman',
  },
  lakeReflection: {
    src: lakeReflectionAsset.src,
    alt: 'Göl yüzeyinde ışık ve ağaç yansımaları',
  },
  mountainLake: {
    src: mountainLakeAsset.src,
    alt: 'Dağların çevrelediği dingin bir göl',
  },
  mountainLakeWide: {
    src: mountainLakeWideAsset.src,
    alt: 'Uzak dağlara açılan geniş bir göl manzarası',
  },
  aboutMe: {
    src: aboutMeAsset.src,
    alt: 'Tapınak duvar resminin önünde oturan Sakin Zihin eğitmeni',
  },
  practicePortrait: {
    src: practicePortraitAsset.src,
    alt: 'Açık havada meditasyon pratiği',
  },
  practiceBackdrop: {
    src: practiceBackdropAsset.src,
    alt: 'Açık havada meditasyon pratiği yapan eğitmen',
  },
};

const imageKeys = Object.keys(imageRegistry) as ImageKey[];

function stableIndex(value: string): number {
  return [...value].reduce((sum, character) => sum + character.codePointAt(0)!, 0);
}

export function imageForContent(slug: string, offset = 0): EditorialImage {
  return imageRegistry[imageKeys[(stableIndex(slug) + offset) % imageKeys.length]];
}
