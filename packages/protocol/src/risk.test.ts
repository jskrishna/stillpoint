import { describe, expect, it } from 'vitest';
import { BASELINE_RULES, baselineRiskScreen, noRiskScreen } from './risk.js';

const assess = (text: string) => baselineRiskScreen.assess(text);

describe('the baseline risk screen', () => {
  it('finds nothing in ordinary upset', () => {
    expect(assess('My manager called out my mistake in front of the whole team').level).toBe(
      'none',
    );
    expect(assess('I felt ashamed and rejected').level).toBe('none');
  });

  it('finds nothing in an empty or blank utterance', () => {
    expect(assess('').level).toBe('none');
    expect(assess('   \n  ').level).toBe('none');
  });

  it('catches the phrasing the designs themselves use', () => {
    const result = assess(
      'I keep messing up. Sometimes I think everyone would be better off without me.',
    );
    expect(result.level).toBe('high');
    expect(result.category).toBe('self_harm');
    expect(result.matched).toBe('better off without me');
  });

  it('catches explicit self-harm phrasings', () => {
    for (const text of [
      'I want to die',
      'I have been thinking about ending my life',
      'sometimes I just want to hurt myself',
      'there is no reason to live',
      'I wish I was dead',
    ]) {
      expect(assess(text).level, text).toBe('high');
    }
  });

  it('is not fooled by a curly apostrophe', () => {
    expect(assess('I don’t want to be here any more').level).toBe('high');
    expect(assess("I don't want to be here any more").level).toBe('high');
  });

  it('is not fooled by case or punctuation', () => {
    expect(assess('KILL MYSELF.').level).toBe('high');
    expect(assess('...kill   myself...').level).toBe('high');
  });

  it('reads across a line break from a transcript', () => {
    expect(assess('everyone would be\nbetter off without me').level).toBe('high');
  });

  it('grades harm to others', () => {
    expect(assess('I could hurt him').level).toBe('medium');
    expect(assess('I want to kill him').level).toBe('high');
  });

  it('grades the medical and trauma cases the queue shows', () => {
    expect(assess('I stopped my meds last week').category).toBe('medical');
    expect(assess('I stopped my meds last week').level).toBe('medium');
    expect(assess('he hit me when I was small').category).toBe('trauma');
  });

  it('takes the most severe match when an utterance trips several', () => {
    const result = assess('I stopped my meds and I want to die');
    expect(result.level).toBe('high');
    expect(result.category).toBe('self_harm');
  });

  it('reports what matched, so a reviewer can see why', () => {
    expect(assess('I want to die').matched).toBe('want to die');
  });

  it('leaves category unset when nothing matched', () => {
    expect(assess('a normal day').category).toBeUndefined();
  });
});

describe('Hindi and Hinglish', () => {
  /**
   * The bug this closes, stated as a test.
   *
   * `normalise()` dropped every character outside `[a-z' ]`. An utterance
   * written in Devanagari did not go unmatched — it became an empty string and
   * returned `none` before a single rule ran. In an India-first product, that
   * is the clearest disclosure there is, arriving invisible.
   */
  it('does not throw away the script half the country writes in', () => {
    expect(baselineRiskScreen.assess('मुझे मरना है')).toEqual({
      level: 'high',
      category: 'self_harm',
      matched: 'मुझे मरना है',
      unreadable: false,
    });
  });

  it('reads a statement of intent in either script as high', () => {
    for (const said of [
      'mujhe marna hai yaar',
      'khudkhushi kar lunga',
      'मैं आत्महत्या करना चाहता हूँ',
      'ab main jaan de dunga',
    ]) {
      expect(baselineRiskScreen.assess(said).level, said).toBe('high');
    }
  });

  /**
   * The ceiling rule, in the other scripts too. Hopelessness is not intent,
   * `high` ends a session, and someone having an ordinary bad day says these.
   */
  it('keeps hopelessness at medium rather than grading it up', () => {
    for (const said of [
      'ab jeene ka mann nahi karta',
      'main sabke liye bojh ban gaya hu',
      'मैं जीने से थक गया हूँ',
      'जीने का मन नहीं है',
    ]) {
      expect(baselineRiskScreen.assess(said).level, said).toBe('medium');
    }
  });

  it('leaves an ordinary bad day alone in both scripts', () => {
    for (const said of [
      'aaj mera manager bahut bura bola',
      'मेरा दिन बहुत खराब था',
      'mujhe gussa aa raha hai',
    ]) {
      expect(baselineRiskScreen.assess(said), said).toEqual({ level: 'none', unreadable: false });
    }
  });

  it('is not fooled by a danda or a stray zero-width joiner', () => {
    // Both arrive from a phone keyboard, and both used to be the difference
    // between a match and nothing.
    expect(baselineRiskScreen.assess('मुझे मरना है। बस।').level).toBe('high');
    expect(baselineRiskScreen.assess('मुझे\u200c मरना है').level).toBe('high');
  });

  it('still sees English in a sentence that is mostly not', () => {
    expect(baselineRiskScreen.assess('मेरा मन नहीं लग रहा, I want to die').level).toBe('high');
  });
});

describe('noRiskScreen', () => {
  it('finds nothing, for tests that are not about safety', () => {
    expect(noRiskScreen.assess('I want to die').level).toBe('none');
  });
});

describe('what the screen cannot read', () => {
  // The screen has phrases in Latin and Devanagari and in nothing else. India
  // has many more scripts than two, and until now an utterance in one of them
  // was normalised to an empty string and graded `none` — the same answer as
  // an ordinary bad day. These assert that the two answers are now different.
  const unreadable = [
    ['আমি মরতে চাই', 'Bengali'],
    ['நான் சாக விரும்புகிறேன்', 'Tamil'],
    ['નિરાશ છું', 'Gujarati'],
    ['ನನಗೆ ಬೇಸರವಾಗಿದೆ', 'Kannada'],
    ['میں تھک گیا ہوں', 'Urdu, in Perso-Arabic'],
  ] as const;

  it.each(unreadable)('says it could not read %s (%s)', (utterance) => {
    const assessment = baselineRiskScreen.assess(utterance);
    expect(assessment.level).toBe('none');
    expect(assessment.unreadable).toBe(true);
  });

  it('does not say that about the scripts it does have phrases for', () => {
    for (const utterance of [
      'my manager called out my mistake',
      'aaj mera manager bahut bura bola',
      'मेरा दिन बहुत खराब था',
      'मुझे मरना है',
    ]) {
      expect(baselineRiskScreen.assess(utterance).unreadable).toBe(false);
    }
  });

  it('does not say that about punctuation, digits or emoji', () => {
    // None of these are letters, so none of them is evidence about a language.
    expect(baselineRiskScreen.assess('I am fine 😊 — really, 100%').unreadable).toBe(false);
    expect(baselineRiskScreen.assess('').unreadable).toBe(false);
    expect(baselineRiskScreen.assess('   ').unreadable).toBe(false);
  });

  it('still stops a session when the readable part says so', () => {
    // The dangerous reading of this change would be "unreadable, so stand
    // down". One unreadable word must not suppress a high match in the rest.
    const assessment = baselineRiskScreen.assess('I want to die, মা');
    expect(assessment.level).toBe('high');
    expect(assessment.unreadable).toBe(true);
  });

  it('is an admission and not a risk level', () => {
    // Nothing about being unreadable raises the level. If it ever did, every
    // turn in Tamil would stop a session, which is not a product anybody can
    // use and is not a judgement this screen is entitled to make.
    expect(baselineRiskScreen.assess('நான் சாக விரும்புகிறேன்').level).toBe('none');
  });
});

describe('French', () => {
  /**
   * The bug this closes, stated as a test.
   *
   * Canada is the first market and French is one of its two official
   * languages. French is Latin script, so `normalise()` did not throw it away
   * the way it once threw away Devanagari — it threw away only the accents,
   * and then found no phrase and returned `none` with `unreadable: false`.
   *
   * That is worse than the Devanagari bug it resembles. There, the screen now
   * at least admits it could not read the text. Here it gave a plain statement
   * of intent a confident clean answer.
   */
  it('reads a statement of intent as high', () => {
    for (const said of [
      'je veux mourir',
      'je veux me tuer',
      'j’ai envie de me suicider',
      'je veux en finir',
      'mettre fin à mes jours',
      'tout le monde serait mieux sans moi',
    ]) {
      expect(baselineRiskScreen.assess(said).level, said).toBe('high');
    }
  });

  /**
   * The ceiling rule, in French too. Wanting not to live is not a statement of
   * intent, and `high` ends the session — so if this graded up, the French half
   * of the screen would stop sessions the English half would not.
   */
  it('keeps hopelessness at medium rather than grading it up', () => {
    for (const said of [
      'je n’en peux plus',
      'je ne peux plus continuer',
      'je suis fatigué de vivre',
      'je ne veux plus vivre',
      'je suis un fardeau pour tout le monde',
    ]) {
      expect(baselineRiskScreen.assess(said).level, said).toBe('medium');
    }
  });

  it('leaves an ordinary bad day alone', () => {
    for (const said of [
      'aujourd’hui mon patron m’a critiqué devant toute l’équipe',
      'je suis en colère',
      'je me sens seul',
    ]) {
      expect(baselineRiskScreen.assess(said), said).toEqual({
        level: 'none',
        unreadable: false,
      });
    }
  });

  /**
   * Accents are folded, so the same sentence matches typed either way — which
   * matters because a phone keyboard without French accents is common, and
   * because the alternative was listing every spelling twice.
   */
  it('matches with or without the accents', () => {
    expect(baselineRiskScreen.assess('je suis fatigué de vivre').level).toBe('medium');
    expect(baselineRiskScreen.assess('je suis fatigue de vivre').level).toBe('medium');
    expect(baselineRiskScreen.assess('mettre fin à mes jours').level).toBe('high');
    expect(baselineRiskScreen.assess('mettre fin a mes jours').level).toBe('high');
  });

  it('still reads Devanagari, which the folding must not disturb', () => {
    expect(baselineRiskScreen.assess('मुझे मरना है').level).toBe('high');
    expect(baselineRiskScreen.assess('मैं जीने से थक गया हूँ').level).toBe('medium');
    expect(baselineRiskScreen.assess('मेरा दिन बहुत खराब था').level).toBe('none');
  });

  /**
   * The limitation this leaves, stated so nobody has to rediscover it.
   *
   * `unreadable` is true only for a script the screen has no phrases for at
   * all. A language written in Latin script that it has no phrases for — and
   * there are many — is normalised cleanly, matches nothing, and comes back
   * `none` with `unreadable: false`: the confident clean answer that French
   * used to get. French is covered now because Canada is the first market;
   * Spanish and Portuguese are not covered and do not announce themselves.
   */
  it('cannot say when a Latin-script language is simply not covered', () => {
    const spanish = baselineRiskScreen.assess('quiero morirme');
    expect(spanish.level).toBe('none');
    expect(spanish.unreadable).toBe(false);
  });

  /**
   * And which answer somebody gets depends on their keyboard.
   *
   * This is the sharpest way to say the limitation above, and it is measured
   * rather than argued: the same sentence, the same language, typed two ways.
   * In its own script the screen admits it could not read it. In Latin letters
   * — which is how a great many people type on a phone — the same words come
   * back as nothing found, with confidence. So `unreadable` bounds the gap for
   * somebody whose keyboard is not Latin and not for the same person on a
   * transliterating one.
   *
   * Hindi is the counter-example in the same test on purpose, because it shows
   * what closing the gap costs: it is graded both ways only because the
   * Hinglish spellings were written out by hand, and every other language
   * needs that same work with a missed spelling being a missed disclosure.
   *
   * These expectations describe the screen as it is, not as it should be.
   * A later change that grades any of them is an improvement, and this test
   * going red is how it announces itself — do not "fix" it by loosening the
   * assertion. The review pack prints this same table from the same function.
   */
  it('answers the same words differently depending on the keyboard', () => {
    // Covered in both scripts: the phrases exist for both spellings.
    expect(baselineRiskScreen.assess('मुझे मरना है').level).toBe('high');
    expect(baselineRiskScreen.assess('mujhe marna hai').level).toBe('high');

    for (const [native, roman] of [
      ['ਮੈਂ ਮਰਨਾ ਚਾਹੁੰਦਾ ਹਾਂ', 'main marna chahunda han'],
      ['我想死', 'wo xiang si'],
      ['я хочу умереть', 'ya hochu umeret'],
    ] as const) {
      const inScript = baselineRiskScreen.assess(native);
      expect(inScript.level).toBe('none');
      // Honest: it says it could not read this.
      expect(inScript.unreadable).toBe(true);

      const inLatin = baselineRiskScreen.assess(roman);
      expect(inLatin.level).toBe('none');
      // Not honest, and nothing distinguishes it from an ordinary bad day.
      expect(inLatin.unreadable).toBe(false);
    }
  });
});

describe('the same phrase, the way a phone types it', () => {
  /*
   * Every case here is a phrase the screen already lists, typed in a way it
   * did not recognise. Measured before this was fixed, over the rules
   * themselves rather than over examples picked by hand:
   *
   *   - all twelve phrases that contain an apostrophe came back `none` with the
   *     apostrophe left out, which is how a great many people type on a phone
   *     ("dont", "cant", "jai"). One of the twelve is `high`, so a statement
   *     the screen stops a session for did not stop it;
   *   - all three Devanagari phrases with a conjunct in them came back `none`
   *     with a joiner inside the conjunct, two of them `high`. The normaliser
   *     turned a joiner into a space, which is right between two words and
   *     splits one word in half;
   *   - 131 of 155 came back `none` with a zero-width space or a soft hyphen
   *     inside a word, which is what copying text out of a web page leaves;
   *   - and all 135 Latin phrases came back `none` in fullwidth letters, with
   *     `unreadable: false`, because a fullwidth letter is Latin script.
   *
   * None of this adds a phrase or a language. It is one more reading of the
   * same text against the same list, and a match in either reading counts, so
   * nothing that matched before can stop matching.
   */
  const rank = { none: 0, low: 1, medium: 2, high: 3 } as const;
  const listed = BASELINE_RULES.flatMap((rule) =>
    rule.phrases.map((phrase) => ({ phrase, level: rule.level })),
  );

  /** Asserts a respelling of every phrase it applies to is graded no lower. */
  const gradedNoLower = (respell: (phrase: string) => string, atLeast: number) => {
    const changed = listed.filter(({ phrase }) => respell(phrase) !== phrase);
    // A respelling that applies to nothing would pass in silence.
    expect(changed.length).toBeGreaterThanOrEqual(atLeast);

    const missed = changed.filter(
      ({ phrase, level }) => rank[assess(respell(phrase)).level] < rank[level],
    );
    expect(missed.map(({ phrase }) => phrase)).toEqual([]);
  };

  it('reads a phrase with its apostrophe left out', () => {
    gradedNoLower((phrase) => phrase.replaceAll("'", ''), 12);
  });

  it('stops for the one of those that is a statement of intent', () => {
    const high = listed.filter(({ phrase, level }) => level === 'high' && phrase.includes("'"));
    expect(high.length).toBeGreaterThan(0);
    for (const { phrase } of high) {
      const typed = `honestly i ${phrase.replaceAll("'", '')} any more`;
      expect(assess(typed).level, typed).toBe('high');
      // What a reviewer is shown is the phrase as it is listed.
      expect(assess(typed).matched).toBe(phrase);
    }
  });

  it.each([
    ['a modifier apostrophe', '\u02bc'],
    ['an acute accent', '\u00b4'],
    ['a prime', '\u2032'],
    ['a fullwidth apostrophe', '\uff07'],
    ['a reversed quotation mark', '\u201b'],
    ['an okina', '\u02bb'],
  ])('reads %s as an apostrophe', (_name, character) => {
    gradedNoLower((phrase) => phrase.replaceAll("'", character), 12);
  });

  it.each([
    ['a zero-width joiner', '\u200d'],
    ['a zero-width non-joiner', '\u200c'],
  ])('reads a conjunct with %s inside it', (_name, joiner) => {
    gradedNoLower((phrase) => phrase.replaceAll('\u094d', `\u094d${joiner}`), 3);
  });

  it('still reads a joiner that stands where a space should be', () => {
    // The other half, and the reason there are two readings rather than one
    // changed rule: deleting a joiner is right inside a word and would join
    // two words that had only a joiner between them. Those matched before.
    gradedNoLower((phrase) => phrase.replaceAll(' ', '\u200c'), 140);
    gradedNoLower((phrase) => phrase.replaceAll(' ', '\u200b'), 140);
  });

  it.each([
    ['a zero-width space', '\u200b'],
    ['a soft hyphen', '\u00ad'],
    ['a word joiner', '\u2060'],
    ['a byte-order mark', '\ufeff'],
  ])('reads a word with %s inside it', (_name, invisible) => {
    gradedNoLower((phrase) => `${phrase.slice(0, 2)}${invisible}${phrase.slice(2)}`, 155);
  });

  it('reads fullwidth letters, which an East Asian keyboard types', () => {
    const fullwidth = (phrase: string) =>
      [...phrase]
        .map((c) => (/[a-z]/.test(c) ? String.fromCodePoint(c.charCodeAt(0) + 0xfee0) : c))
        .join('');
    gradedNoLower(fullwidth, 135);

    // And it no longer answers "nothing found" about text it had not read.
    expect(assess(fullwidth('i want to die'))).toMatchObject({ level: 'high', unreadable: false });
  });

  it('reads a ligature and a styled alphabet', () => {
    gradedNoLower((phrase) => phrase.replaceAll('fi', '\ufb01').replaceAll('fl', '\ufb02'), 1);

    // Mathematical bold, which is what "bold text" generators produce. The
    // letters are not Latin script, so the screen still says it could not read
    // all of it, and it stops on what it could.
    const bold = [...'i want to die']
      .map((c) => (/[a-z]/.test(c) ? String.fromCodePoint(0x1d41a + c.charCodeAt(0) - 97) : c))
      .join('');
    expect(assess(bold)).toMatchObject({ level: 'high', unreadable: true });
  });

  it('changes nothing about a phrase typed as it is listed', () => {
    // The strict reading runs first and is not altered, so the grade and the
    // phrase a reviewer is shown are what they were.
    for (const { phrase, level } of listed) {
      expect(rank[assess(phrase).level], phrase).toBeGreaterThanOrEqual(rank[level]);
    }
    expect(assess('I want to kill myself').matched).toBe('kill myself');
  });

  it('leaves an ordinary bad day alone, apostrophes and all', () => {
    for (const said of [
      "I can't believe my manager said that in front of everyone",
      'i cant believe my manager said that in front of everyone',
      "It's been a long week and I'm tired of the meetings",
      'its been a long week and im tired of the meetings',
      "we'll be here until six, she'll call when it's done",
      'Ｍｙ ｍａｎａｇｅｒ ｗａｓ ｒｕｄｅ ｔｏｄａｙ',
      'my man\u00adager was rude to\u200bday',
    ]) {
      expect(assess(said).level, said).toBe('none');
    }
  });

  it('answers the same about a letter that belongs to no one script', () => {
    // A script's name is not one property. PCRE2 matched it against Script
    // before 10.40 and against Script_Extensions from it, so PHP's
    // `\p{Latin}` called a sentence typed with the modifier apostrophe
    // readable on one server and unreadable on another, and the fixture this
    // file's twin asserts went red in CI having been generated on a Mac. Both
    // languages take those characters out before asking about a script, so
    // neither property is ever consulted about them.
    for (const said of [
      'I don\u02bct know',
      'c\u02c7est',
      '\u092e\u0948\u0902 \u0920\u0940\u0915 \u1ce9',
    ]) {
      expect(assess(said).unreadable, said).toBe(false);
    }
    // And a script the screen has no phrases for is still one it cannot read.
    expect(assess('\u0986\u09ae\u09bf \u02bc').unreadable).toBe(true);
  });
});
