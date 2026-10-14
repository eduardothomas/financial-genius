import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { GoalView } from '../lib/api';
import { GOAL_LABEL } from '../lib/format';
import { useSession } from '../lib/session';
import { color, radius, space, type } from './theme';

/** Elige la meta para Plan y Productos. Por defecto, la de mayor prioridad. */
export function GoalPicker({ goals }: { goals: GoalView[] }) {
  const { goalId, setGoalId } = useSession();
  useEffect(() => {
    if (goals.length && !goals.some((g) => g.id === goalId)) setGoalId(goals[0]!.id);
  }, [goals, goalId, setGoalId]);
  if (goals.length < 2) return null;
  return (
    <View style={s.row} accessibilityRole="tablist">
      {goals.map((g) => {
        const on = g.id === goalId;
        return (
          <Pressable
            key={g.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => setGoalId(g.id)}
            style={[s.chip, on && s.on]}
          >
            <Text style={[s.text, on && { color: '#fff', fontWeight: '600' }]}>{GOAL_LABEL[g.type]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg },
  chip: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, backgroundColor: color.surface },
  on: { backgroundColor: color.lock, borderColor: color.lock },
  text: { ...type.small, color: color.lock },
});
