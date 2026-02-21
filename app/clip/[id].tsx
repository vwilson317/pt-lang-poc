import { useLocalSearchParams } from 'expo-router';
import { ClipDetailScreen } from '../../src/screens/ClipDetailScreen';

export default function ClipDetailRoute() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  return <ClipDetailScreen clipId={id} />;
}
