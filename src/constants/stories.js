export const EXAMPLE_STORY = {
  id: 'cgt-spring-budget',
  headline: 'Chancellor weighs capital gains tax rise in spring budget',
  dek: 'Treasury sources say higher rates on asset sales are being considered as the government hunts for revenue.',
  date: '18 June 2026',
  section: 'Round table',
  details: [
    'The Treasury is looking at raising capital gains tax — the tax paid when you sell an asset for more than you paid, such as a second home, shares, or a business.',
    'Supporters say wealthier investors should pay more, especially when nurses and teachers pay full income tax on every pound they earn. Critics warn it could discourage people from starting businesses or selling property.',
    'No final decision has been made. The chancellor is expected to announce plans in the autumn budget.',
  ],
  question: 'Should the UK increase capital gains tax?',
}

export const STORIES = [EXAMPLE_STORY]

export function getStory(id = EXAMPLE_STORY.id) {
  return STORIES.find((s) => s.id === id) || EXAMPLE_STORY
}
