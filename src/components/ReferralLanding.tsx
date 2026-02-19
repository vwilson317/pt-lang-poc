import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { recordReferralClick, setReferralSlug } from '../lib/pilot';
import { theme } from '../theme';

interface ReferralLandingProps {
  slug: string;
}

/** Web-only: when someone opens /r/:slug we record the click, store slug for signup attribution, then redirect. */
export function ReferralLanding({ slug }: ReferralLandingProps) {
  const [status, setStatus] = useState<'loading' | 'redirecting' | 'done'>('loading');

  useEffect(() => {
    if (Platform.OS !== 'web' || !slug) return;

    let mounted = true;

    (async () => {
      try {
        await recordReferralClick(slug);
        if (mounted) setReferralSlug(slug);
      } catch {
        // still redirect
      }
      if (mounted) setStatus('redirecting');
      if (typeof window !== 'undefined') {
        window.location.href = '/signup';
      }
      if (mounted) setStatus('done');
    })();

    return () => {
      mounted = false;
    };
  }, [slug]);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        {status === 'loading' ? 'Taking you to Inflama…' : 'Redirecting…'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bgDark,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  text: {
    fontSize: 18,
    color: theme.textSecondary,
  },
});
