import { Audio } from 'expo-av';

let sound: Audio.Sound | null = null;

export async function playWordAudio(audioUrl: string | undefined): Promise<void> {
  if (!audioUrl) return;
  try {
    if (sound) {
      await sound.unloadAsync();
      sound = null;
    }
    const { sound: s } = await Audio.Sound.createAsync(
      { uri: audioUrl },
      { shouldPlay: true }
    );
    sound = s;
    s.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        s.unloadAsync();
        sound = null;
      }
    });
  } catch {
    // ignore; no audio in v1 is fine
  }
}
