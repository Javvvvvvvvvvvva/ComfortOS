import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../theme";

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // A production monitoring adapter can report a sanitized event here.
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View accessibilityLiveRegion="assertive" style={styles.root}>
        <Text style={styles.title}>Ahhway needs a fresh start</Text>
        <Text style={styles.message}>
          Your trip was not saved. Check your connection, then try opening the route planner
          again.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => this.setState({ failed: false })}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    backgroundColor: COLORS.white,
  },
  title: { color: COLORS.ink, fontSize: 22, fontWeight: "800", textAlign: "center" },
  message: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 10,
  },
  button: {
    minWidth: 140,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    backgroundColor: COLORS.ink,
    marginTop: 20,
  },
  buttonText: { color: COLORS.white, fontSize: 15, fontWeight: "800" },
  pressed: { opacity: 0.72 },
});
