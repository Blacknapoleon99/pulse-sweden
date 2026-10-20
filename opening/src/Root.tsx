import "./index.css";
import { Composition } from "remotion";
import { CajklopsOpening } from "./CajklopsOpening";
import { CajklopsIcon } from './CajklopsIcon';
import { EVERYDAY_FRAMES, OPENING_FRAMES, ICON_FRAMES } from "./timing";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="CajklopsIcon" component={CajklopsIcon} durationInFrames={ICON_FRAMES} fps={30} width={480} height={480}/>
      <Composition id="CajklopsOpening" component={CajklopsOpening}
        defaultProps={{variant:'cinematic' as const}}
        durationInFrames={OPENING_FRAMES} fps={30} width={720} height={1280} />
      <Composition id="CajklopsEveryday" component={CajklopsOpening}
        defaultProps={{variant:'everyday' as const}}
        durationInFrames={EVERYDAY_FRAMES} fps={30} width={720} height={1280}/>
    </>
  );
};
