/**
 * All user-facing copy lives here so the empathetic, non-preachy voice stays
 * consistent. Written from the user's side of the screen: plain verbs, sentence
 * case, no filler, never clinical.
 */

export const strings = {
  app: {
    name: 'SPER',
    tagline: 'Stay close through the distance.',
  },

  nav: {
    today: 'Today',
    checkIn: 'Check in',
    circle: 'Circle',
    settings: 'Settings',
  },

  auth: {
    signInTitle: 'Welcome back',
    signUpTitle: 'Create your account',
    email: 'Email',
    password: 'Password',
    name: 'Your name',
    signIn: 'Sign in',
    signUp: 'Create account',
    magicLink: 'Email me a sign-in link',
    toggleToSignUp: 'New here? Create an account',
    toggleToSignIn: 'Already have an account? Sign in',
    invalid: 'That email or password didn’t work. Try again.',
    forgotPassword: 'Forgot password?',
    resetTitle: 'Reset your password',
    resetBody: 'Enter your email and we’ll send you a reset code.',
    resetSent: 'If that email has an account, a reset code is on its way. Enter it below with a new password.',
    sendResetCode: 'Send reset code',
    resetCode: 'Reset code',
    newPassword: 'New password',
    resetPasswordCta: 'Set new password',
    backToSignIn: '‹ Back to sign in',
  },

  onboarding: {
    timezoneTitle: 'When’s a good time to check in?',
    timezonePrompt: 'Pick the timezone you’re usually in.',
    timezoneBody: 'We’ll send your quiet daily nudge around 9am your time.',
    confirmTimezone: 'Confirm timezone',
    looksRight: 'Looks right',
    changeTimezone: 'Change timezone',
    joinTitle: 'Start or join a circle',
    joinBody: 'A circle is a few people who agree to notice each other.',
    createCircle: 'Start a new circle',
    circleName: 'Name your circle',
    joinCircle: 'Join with a code',
    code: '6-character code',
    join: 'Join',
    create: 'Create',
  },

  pact: {
    title: 'The Circle Pact',
    body: 'We check in honestly. We notice when someone is heavy. We show up off-app when called upon.',
    checkboxLabel: 'I’ve read this and agree to it.',
    agree: 'I agree',
    subtext: 'Everyone agrees before the circle opens.',
  },

  sper: {
    title: 'Your circle',
    empty: 'No check-ins yet today. Yours can be the first.',
    checkInCta: 'Wanna update your SPER?',
    quietFor: (name: string) => `${name} has been quiet for a bit`,
  },

  checkIn: {
    title: 'How are you, honestly?',
    subtitle: 'Tap one for each. No wrong answers.',
    notePlaceholder: 'Any quick context? (optional)',
    submit: 'Share with my circle',
    dimensions: {
      spiritual: 'Spiritual',
      physical: 'Physical',
      emotional: 'Emotional',
      vocational: 'Career / Life',
      relational: 'Relational',
    },
    botIntro: 'Hey — quick check-in. Just five taps, honestly answered.',
    botQuestions: {
      spiritual: 'How’s your walk with God today?',
      physical: 'How’s your body holding up?',
      emotional: 'How are you feeling underneath it all?',
      vocational: 'How’s work or life direction sitting with you?',
      relational: 'How connected do you feel to the people around you?',
    },
    botNotePrompt: 'Anything you want to add? Totally optional.',
    botOutro: 'Got it. Sending this to your circle.',
    notePlaceholderShort: 'Type a note…',
    send: 'Send',
    skip: 'Skip',
    changeAnswer: 'Change',
    resultTitle: 'Your check-in',
    resultSubtitle: (rel: string) => `Last updated ${rel}`,
    update: 'Update my check-in',
    done: 'Done',
    changeFrequency: 'Change how often you check in',
  },

  care: {
    cardTitle: (name: string) => `${name} could use some care`,
    guidance: 'Encouraging your friends by:',
    sendVoiceNote: 'Send a voice note',
    sendMessage: 'Send a message',
    call: 'Call',
    pray: 'I prayed',
    logCare: 'I reached out',
    alreadyReached: (names: string) => `${names} already reached out`,
    acked: (name: string) => `${name} stepped up to hold space for you today.`,
    thankYou: 'Thank you!',
    gratitudeSent: 'You thanked everyone who reached out.',
    gratitudeReceived: (name: string) => `${name} wants to show gratitude for your care.`,
    selfTitle: 'You could use some care',
    treeTitle: 'Your tree today',
    thrivingCaption: 'Growing steady — thanks for checking in.',
    responseCount: (n: number) =>
      n === 1 ? 'Someone has watered your tree today.' : `${n} people have watered your tree today.`,
    encouragement: 'Someone already cares for you!',
    prayerToast: 'Someone just prayed for you.',
    desktopOutreachNote: 'Sending a voice note or message works from a phone — open this on your phone to reach out this way, or log "I prayed" from here.',
  },

  member: {
    detailTitle: 'Check-in',
    noCheckIn: 'No check-in yet — nothing to see here.',
    lastCheckIn: (rel: string) => `Checked in ${rel}`,
    close: 'Close',
  },

  settings: {
    title: 'Settings',
    profile: 'Profile',
    notifications: 'Notifications',
    notificationsBody: 'Pause your daily check-in nudge without leaving your circle.',
    pauseNudge: 'Pause daily nudge',
    timezone: 'Timezone',
    frequency: 'Check-in frequency',
    frequencyBody: 'How often should we prompt you to check in?',
    frequencyOnce: 'Once a day',
    frequencyTwice: 'Twice a day',
    frequencyThrice: 'Three times a day',
    aboutCircle: 'About this circle',
    viewPact: 'Review the pact',
    signOut: 'Sign out',
    version: 'SPER · version 0.1.0',
  },

  grace: {
    banner: (name: string) =>
      `${name} has been quiet for a couple of weeks. No pressure — just drop a note to say you love them.`,
  },

  circle: {
    title: 'My circle',
    yourCircles: 'Your circles',
    joinAnother: '+ Join another circle',
    invite: 'Invite someone',
    inviteBody: 'Share this code. It works once.',
    members: 'Members',
    leave: 'Leave circle',
    pactAgreed: 'Agreed',
    pactPending: 'Pact pending',
  },

  common: {
    retry: 'Try again',
    loading: 'One moment…',
    error: 'Something went wrong. Try again.',
    cancel: 'Cancel',
  },
} as const;

export default strings;
