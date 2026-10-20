import { Asset } from 'expo-asset';

const pending = new Map<number, Promise<string>>();
// Expo Go serves require() assets over Metro. Cache the whole clip before playing,
// so a slow tunnel cannot consume the animation behind the native loading screen.
export function cachedCajklopsVideo(moduleId: number): Promise<string> {
  let request = pending.get(moduleId);
  if (!request) {
    request = Asset.fromModule(moduleId).downloadAsync().then(asset => asset.localUri ?? asset.uri);
    pending.set(moduleId, request);
    void request.catch(() => pending.delete(moduleId));
  }
  return request;
}
