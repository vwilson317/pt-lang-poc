import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { Tabs } from 'expo-router';
import { theme } from '../../src/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0B1029',
          borderTopColor: 'rgba(255,255,255,0.15)',
        },
        tabBarActiveTintColor: theme.textPrimary,
        tabBarInactiveTintColor: theme.textMuted,
      }}
    >
      <Tabs.Screen
        name="practice"
        options={{
          title: 'Practice',
          tabBarIcon: ({ color, size }) => <FontAwesome5 name="bolt" size={size} color={color} solid />,
        }}
      />
      <Tabs.Screen
        name="import"
        options={{
          title: 'Media',
          tabBarIcon: ({ color, size }) => <FontAwesome5 name="file-import" size={size} color={color} solid />,
        }}
      />
      <Tabs.Screen
        name="clips"
        options={{
          title: 'Clips',
          tabBarIcon: ({ color, size }) => <FontAwesome5 name="film" size={size} color={color} solid />,
        }}
      />
      <Tabs.Screen
        name="decks"
        options={{
          title: 'Decks',
          tabBarIcon: ({ color, size }) => <FontAwesome5 name="layer-group" size={size} color={color} solid />,
        }}
      />
    </Tabs>
  );
}
