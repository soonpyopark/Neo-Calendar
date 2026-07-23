/**
 * Curated emoji set for the title emoji picker (quick-edit / event editor).
 * Grouped into small, calendar-relevant categories rather than the full Unicode set —
 * keeps the picker fast and easy to scan without pulling in an emoji-data dependency.
 */

export type EmojiCategory = {
  id: string
  label: string
  icon: string
  emojis: string[]
}

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'smileys',
    label: '스마일리',
    icon: '😀',
    emojis: [
      '😀', '😁', '😂', '🤣', '😊', '🙂', '😉', '😍', '🥰', '😘',
      '😎', '🤔', '😐', '🙄', '😴', '🥱', '😢', '😭', '😡', '🤯',
      '🥳', '🤩', '😱', '🤗', '😇', '🤤', '🤪', '😜', '🙃', '😌',
    ],
  },
  {
    id: 'people',
    label: '사람',
    icon: '👍',
    emojis: [
      '👍', '👎', '👏', '🙏', '💪', '🙌', '👌', '✌️', '🤝', '👋',
      '🤞', '👀', '🧑', '👶', '🧓', '🧑‍💻', '🧑‍🎓', '🧑‍🍳', '🧑‍⚕️', '🧑‍🏫',
    ],
  },
  {
    id: 'animals',
    label: '동물&자연',
    icon: '🐶',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
      '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦋', '🐝',
      '🌸', '🌼', '🌳', '🌈', '☀️', '🌙', '⭐', '☁️', '🌧️', '❄️',
    ],
  },
  {
    id: 'food',
    label: '음식',
    icon: '🍕',
    emojis: [
      '🍎', '🍌', '🍇', '🍉', '🍓', '🍒', '🍑', '🍕', '🍔', '🍟',
      '🌮', '🍣', '🍜', '🍚', '🍞', '🥐', '🍰', '🎂', '🍪', '🍫',
      '🍬', '🍿', '☕', '🍵', '🧃', '🍺', '🍷', '🥤',
    ],
  },
  {
    id: 'activity',
    label: '활동',
    icon: '⚽',
    emojis: [
      '⚽', '🏀', '⚾', '🎾', '🏐', '🏈', '🎱', '🏓', '🏸', '🥊',
      '🏊', '🚴', '🏃', '🧘', '🎮', '🎲', '🎯', '🎳', '🎤', '🎸',
      '🎨', '🎬', '🎭', '📷',
    ],
  },
  {
    id: 'travel',
    label: '여행',
    icon: '✈️',
    emojis: [
      '✈️', '🚗', '🚕', '🚌', '🚆', '🚀', '🚁', '⛵', '🚲', '🏠',
      '🏢', '🏥', '🏫', '⛪', '🗽', '🗼', '🏖️', '🏔️', '🏕️', '🌋',
      '🗺️', '🧳',
    ],
  },
  {
    id: 'objects',
    label: '사물',
    icon: '💡',
    emojis: [
      '💡', '🔑', '💻', '📱', '⌚', '📷', '📺', '🎧', '📚', '📖',
      '✏️', '📝', '📌', '📎', '📅', '🗓️', '⏰', '⏳', '🔔', '🔒',
      '💰', '💵', '💳', '🎁', '🎉', '🎈', '🧧',
    ],
  },
  {
    id: 'symbols',
    label: '기호',
    icon: '❤️',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💯', '✅',
      '❌', '❗', '❓', '⚠️', '🔥', '✨', '⭐', '💫', '♻️', '🔄',
      '▶️', '⏸️', '🆕', '🔴', '🟢', '🔵',
    ],
  },
];
