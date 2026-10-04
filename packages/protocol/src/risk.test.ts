import { describe, expect, it } from 'vitest';
import { baselineRiskScreen, noRiskScreen } from './risk.js';

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
});
