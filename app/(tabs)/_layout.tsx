import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { Tabs } from 'expo-router';
import { theme } from '../../src/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.surfaceStrong,
          borderTopColor: theme.stroke,
        },
        tabBarActiveTintColor: theme.dominant500,
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
          title: 'Upload',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome5 name="file-upload" size={size} color={color} solid />
          ),
        }}
      />
      <Tabs.Screen
        name="imports"
        options={{
          title: 'Imports',
          tabBarIcon: ({ color, size }) => <FontAwesome5 name="film" size={size} color={color} solid />,
        }}
      />
      <Tabs.Screen
        name="imports/[id]"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="decks"
        options={{
          title: 'Decks',
          tabBarIcon: ({ color, size }) => <FontAwesome5 name="layer-group" size={size} color={color} solid />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <FontAwesome5 name="cog" size={size} color={color} solid />,
        }}
      />
    </Tabs>
  );
}
