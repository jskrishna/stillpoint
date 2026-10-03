import { Stack } from 'expo-router';
import { useTheme } from '../../use-theme';

export default function WelcomeLayout() {
  const { c } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }} />;
}
