/**
 * Icon — single source of truth for iconography.
 *
 * Wraps Ionicons behind semantic names so the app uses ONE consistent icon
 * family instead of emoji. Add a name here once; use it everywhere.
 *
 *   <Icon name="location" size={16} color={colors.subtle} />
 */
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';

const MAP = {
  // navigation / chrome
  back:      'chevron-back',
  forward:   'chevron-forward',
  open:      'arrow-forward',
  close:     'close',
  add:       'add',
  search:    'search',
  settings:  'settings-outline',
  more:      'ellipsis-horizontal',
  check:     'checkmark',
  // trip / planning
  location:  'location-outline',
  calendar:  'calendar-outline',
  people:    'people',
  person:    'person-circle-outline',
  plane:     'airplane',
  map:       'map-outline',
  list:      'list',
  sparkles:  'sparkles',
  wand:      'color-wand-outline',
  clock:     'time-outline',
  // activity types
  activity:  'flag',
  food:      'restaurant',
  hotel:     'bed',
  transport: 'bus',
  note:      'document-text-outline',
  // money / needs
  wallet:    'wallet-outline',
  split:     'git-branch-outline',
  star:      'star',
  accessible:'accessibility',
  leaf:      'leaf',
  // feedback
  warning:   'warning-outline',
  info:      'information-circle-outline',
  wave:      'hand-left-outline',
};

export default function Icon({ name, size = 18, color = colors.ink, style }) {
  return <Ionicons name={MAP[name] || name} size={size} color={color} style={style} />;
}
