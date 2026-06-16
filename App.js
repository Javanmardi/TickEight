// App.js — Tick Eight (Expo / React Native)
// Dependencies: expo-document-picker, expo-file-system, @react-native-async-storage/async-storage

import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  Alert, StyleSheet, SafeAreaView, ActivityIndicator,
  StatusBar, Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Constants ────────────────────────────────────────────────────────────────
const BATCH_SIZE = 20;
const CYCLE_DAYS = 8;
const INDIGO = '#4F46E5';
const DARK_INDIGO = '#3730A3';
const BG = '#F5F7FF';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toDateString();

const getBatch = (words, batchIdx) =>
  words.slice(batchIdx * BATCH_SIZE, (batchIdx + 1) * BATCH_SIZE);

const getTotalBatches = (words) => Math.ceil(words.length / BATCH_SIZE);

// On day N (1-based), show batches whose index B satisfies: N-8 ≤ B ≤ N-1
// i.e. each batch is reviewed for exactly 8 consecutive days then retired.
const getActiveBatches = (day, totalBatches) => {
  const min = Math.max(0, day - CYCLE_DAYS);
  const max = Math.min(day - 1, totalBatches - 1);
  const result = [];
  for (let i = min; i <= max; i++) result.push(i);
  return result;
};

// ─── Persistent Storage ───────────────────────────────────────────────────────
const db = {
  getCourses: async () => {
    const raw = await AsyncStorage.getItem('tick8_courses');
    return raw ? JSON.parse(raw) : [];
  },
  saveCourses: (courses) =>
    AsyncStorage.setItem('tick8_courses', JSON.stringify(courses)),
  getCourseData: async (id) => {
    const raw = await AsyncStorage.getItem(`tick8_data_${id}`);
    return raw ? JSON.parse(raw) : null;
  },
  saveCourseData: (id, data) =>
    AsyncStorage.setItem(`tick8_data_${id}`, JSON.stringify(data)),
  deleteCourseData: (id) =>
    AsyncStorage.removeItem(`tick8_data_${id}`),
};

// ─── Root Component ───────────────────────────────────────────────────────────
export default function App() {
  // Navigation
  const [screen, setScreen] = useState('courseList'); // courseList | courseHome | learning

  // Course list
  const [courses, setCourses]           = useState([]);
  const [newName, setNewName]           = useState('');
  const [showInput, setShowInput]       = useState(false);

  // Selected course
  const [course, setCourse]             = useState(null);   // { id, name }
  const [courseData, setCourseData]     = useState(null);   // words, progress, currentDay, …
  const [loading, setLoading]           = useState(false);

  // Learning session
  const [activeBatches, setActiveBatches] = useState([]);
  const [sessionIdx, setSessionIdx]       = useState(0); // index into activeBatches[]
  const [wordIdx, setWordIdx]             = useState(0);
  const [showMeaning, setShowMeaning]     = useState(false);
  const [dayComplete, setDayComplete]     = useState(false);

  // ── Boot ─────────────────────────────────────────────────────────────────────
  useEffect(() => { db.getCourses().then(setCourses); }, []);

  // ── Initialise session when entering learning screen ─────────────────────────
  useEffect(() => {
    if (screen !== 'learning' || !courseData) return;
    const total = getTotalBatches(courseData.words);
    const batches = getActiveBatches(courseData.currentDay, total);
    setActiveBatches(batches);
    setSessionIdx(0);
    setWordIdx(0);
    setShowMeaning(false);
    setDayComplete(false);
  }, [screen]); // eslint-disable-line

  // ── Course list actions ───────────────────────────────────────────────────────
  const openCourse = async (c) => {
    setCourse(c);
    let data = await db.getCourseData(c.id);

    // Auto-advance day when user returns on a new calendar day
    if (data?.dayCompleted && data?.lastDate !== todayStr()) {
      data = { ...data, currentDay: data.currentDay + 1, dayCompleted: false, lastDate: todayStr() };
      await db.saveCourseData(c.id, data);
    }

    setCourseData(data);
    setScreen('courseHome');
  };

  const createCourse = async () => {
    const name = newName.trim();
    if (!name) return;
    const c = { id: Date.now().toString(), name };
    const updated = [...courses, c];
    setCourses(updated);
    await db.saveCourses(updated);
    setNewName('');
    setShowInput(false);
    openCourse(c);
  };

  const confirmDeleteCourse = (c) =>
    Alert.alert('Delete Course', `Delete "${c.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const updated = courses.filter(x => x.id !== c.id);
          setCourses(updated);
          await db.saveCourses(updated);
          await db.deleteCourseData(c.id);
          if (course?.id === c.id) { setCourse(null); setCourseData(null); setScreen('courseList'); }
        },
      },
    ]);

  // ── CSV Upload ────────────────────────────────────────────────────────────────
  const uploadCSV = async () => {
    try {
      setLoading(true);
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (res.canceled) return;

      const cacheUri = FileSystem.cacheDirectory + 'vocab_import.csv';
      await FileSystem.copyAsync({ from: res.assets[0].uri, to: cacheUri });
      const text = await FileSystem.readAsStringAsync(cacheUri, { encoding: FileSystem.EncodingType.UTF8 });

      const words = text
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
          const comma = line.indexOf(',');
          if (comma < 1) return null;
          return { word: line.slice(0, comma).trim(), meaning: line.slice(comma + 1).trim() };
        })
        .filter(w => w && w.word && w.meaning);

      if (!words.length) {
        Alert.alert('Invalid file', 'No valid rows found.\nExpected format: word,meaning');
        return;
      }

      const data = { words, currentDay: 1, progress: {}, dayCompleted: false, lastDate: todayStr() };
      await db.saveCourseData(course.id, data);
      setCourseData(data);
      Alert.alert('✓ Loaded', `${words.length} words imported!`);
    } catch (e) {
      Alert.alert('Error', 'Could not read the file.');
    } finally {
      setLoading(false);
    }
  };

  // ── Learning actions ──────────────────────────────────────────────────────────
  const currentWord = () => {
    if (!courseData || !activeBatches.length) return null;
    return getBatch(courseData.words, activeBatches[sessionIdx])[wordIdx] ?? null;
  };

  const wordHistory = () => {
    const key = `${activeBatches[sessionIdx]}-${wordIdx}`;
    return courseData?.progress?.[key] ?? {};
  };

  const recordAnswer = async (correct) => {
    const bIdx = activeBatches[sessionIdx];
    const key  = `${bIdx}-${wordIdx}`;
    const day  = courseData.currentDay;

    const newProgress = {
      ...courseData.progress,
      [key]: { ...(courseData.progress[key] ?? {}), [day]: correct },
    };

    const batch = getBatch(courseData.words, bIdx);
    let nextSession = sessionIdx;
    let nextWord    = wordIdx + 1;
    let complete    = false;

    if (nextWord >= batch.length) {
      if (sessionIdx + 1 < activeBatches.length) {
        nextSession = sessionIdx + 1;
        nextWord = 0;
      } else {
        complete = true;
      }
    }

    const newData = { ...courseData, progress: newProgress, dayCompleted: complete, lastDate: todayStr() };
    setCourseData(newData);
    await db.saveCourseData(course.id, newData);

    setShowMeaning(false);
    if (complete) {
      setDayComplete(true);
    } else {
      setSessionIdx(nextSession);
      setWordIdx(nextWord);
    }
  };

  const finishDay = async () => {
    const newData = { ...courseData, currentDay: courseData.currentDay + 1, dayCompleted: false, lastDate: todayStr() };
    setCourseData(newData);
    await db.saveCourseData(course.id, newData);
    setScreen('courseHome');
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // SCREEN: Course List
  // ─────────────────────────────────────────────────────────────────────────────
  if (screen === 'courseList') return (
    <SafeAreaView style={s.safe}>
      <StatusBar backgroundColor={DARK_INDIGO} barStyle="light-content" />

      <View style={s.header}>
        <Text style={s.headerTitle}>Tick Eight</Text>
        <Text style={s.headerSub}>Spaced Repetition</Text>
      </View>

      <ScrollView contentContainerStyle={s.pad}>
        <Text style={s.label}>YOUR COURSES</Text>

        {courses.length === 0 && (
          <Text style={s.muted}>No courses yet. Create one below!</Text>
        )}

        {courses.map(c => (
          <TouchableOpacity
            key={c.id}
            style={s.courseRow}
            onPress={() => openCourse(c)}
            onLongPress={() => confirmDeleteCourse(c)}
          >
            <View style={s.avatar}>
              <Text style={s.avatarText}>{c.name[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.courseName}>{c.name}</Text>
              <Text style={s.muted2}>Long-press to delete</Text>
            </View>
            <Text style={s.chevron}>›</Text>
          </TouchableOpacity>
        ))}

        <View style={{ height: 28 }} />
        <Text style={s.label}>NEW COURSE</Text>

        {showInput ? (
          <View style={s.card}>
            <TextInput
              style={s.input}
              placeholder="Course name  (e.g. German A1)"
              placeholderTextColor="#9CA3AF"
              value={newName}
              onChangeText={setNewName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={createCourse}
            />
            <TouchableOpacity style={s.btnPrimary} onPress={createCourse}>
              <Text style={s.btnPrimaryTxt}>Create Course</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnGhost} onPress={() => { setShowInput(false); setNewName(''); }}>
              <Text style={s.btnGhostTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={s.btnPrimary} onPress={() => setShowInput(true)}>
            <Text style={s.btnPrimaryTxt}>+ Create New Course</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // SCREEN: Course Home
  // ─────────────────────────────────────────────────────────────────────────────
  if (screen === 'courseHome') {
    const hasWords = !!courseData?.words?.length;
    const day      = courseData?.currentDay ?? 1;
    const total    = hasWords ? getTotalBatches(courseData.words) : 0;
    const batches  = hasWords ? getActiveBatches(day, total) : [];
    const wordCount = batches.reduce((n, b) => n + getBatch(courseData.words, b).length, 0);

    return (
      <SafeAreaView style={s.safe}>
        <StatusBar backgroundColor={DARK_INDIGO} barStyle="light-content" />

        <View style={s.header}>
          <TouchableOpacity onPress={() => setScreen('courseList')} style={{ width: 50 }}>
            <Text style={s.headerBack}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>{course.name}</Text>
          <View style={{ width: 50 }} />
        </View>

        <ScrollView contentContainerStyle={s.pad}>
          {hasWords ? (
            <>
              {/* Stats row */}
              <View style={s.row}>
                {[
                  { val: day,           lbl: 'Day' },
                  { val: batches.length,lbl: 'Batches' },
                  { val: wordCount,     lbl: 'Words today' },
                ].map(({ val, lbl }) => (
                  <View key={lbl} style={s.statBox}>
                    <Text style={s.statNum}>{val}</Text>
                    <Text style={s.statLbl}>{lbl}</Text>
                  </View>
                ))}
              </View>

              {/* Batch list */}
              <View style={[s.card, { marginBottom: 16 }]}>
                <Text style={s.label}>TODAY'S BATCHES</Text>
                {batches.map(b => (
                  <View key={b} style={s.batchRow}>
                    <View style={s.badge}><Text style={s.badgeTxt}>B{b + 1}</Text></View>
                    <Text style={s.batchInfo}>
                      Words {b * BATCH_SIZE + 1}–{Math.min((b + 1) * BATCH_SIZE, courseData.words.length)}
                      {'   ·   '}Review day {day - b}/{CYCLE_DAYS}
                    </Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={s.btnPrimary}
                onPress={() => setScreen('learning')}
              >
                <Text style={s.btnPrimaryTxt}>
                  {courseData.dayCompleted ? '✓ Today Done — Tap to advance' : `▶  Start Day ${day}`}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={[s.btnGhost, { marginTop: 10 }]} onPress={uploadCSV}>
                <Text style={s.btnGhostTxt}>↺  Replace vocabulary CSV</Text>
              </TouchableOpacity>
            </>
          ) : (
            /* No words yet — show upload prompt */
            <View style={s.card}>
              <Text style={[s.headerTitle, { color: '#1F2937', marginBottom: 8 }]}>Upload Vocabulary</Text>
              <Text style={s.uploadHint}>
                Create a <Text style={s.mono}>.csv</Text> file with one entry per line:{'\n\n'}
                <Text style={s.mono}>Hund,dog{'\n'}laufen,to run{'\n'}das Haus,the house</Text>
              </Text>
              {loading
                ? <ActivityIndicator size="large" color={INDIGO} />
                : (
                  <TouchableOpacity style={[s.btnPrimary, { marginTop: 8 }]} onPress={uploadCSV}>
                    <Text style={s.btnPrimaryTxt}>📂  Select CSV File</Text>
                  </TouchableOpacity>
                )}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SCREEN: Learning
  // ─────────────────────────────────────────────────────────────────────────────
  if (screen === 'learning') {
    const word = currentWord();
    const hist = wordHistory();
    const bIdx = activeBatches[sessionIdx];
    const batch = bIdx !== undefined ? getBatch(courseData.words, bIdx) : [];
    const day = courseData?.currentDay ?? 1;

    // ── Day complete view ──
    if (dayComplete) return (
      <SafeAreaView style={s.safe}>
        <StatusBar backgroundColor={DARK_INDIGO} barStyle="light-content" />
        <View style={s.header}>
          <View style={{ width: 50 }} />
          <Text style={s.headerTitle}>Day {day} Done!</Text>
          <View style={{ width: 50 }} />
        </View>
        <View style={s.centerBox}>
          <Text style={{ fontSize: 72 }}>🎉</Text>
          <Text style={s.doneTitle}>Well done!</Text>
          <Text style={s.doneSub}>
            You reviewed all {activeBatches.length} batch{activeBatches.length > 1 ? 'es' : ''} today.
            {'\n'}Come back tomorrow for Day {day + 1}.
          </Text>
          <TouchableOpacity style={s.btnPrimary} onPress={finishDay}>
            <Text style={s.btnPrimaryTxt}>Confirm & Go to Day {day + 1}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btnGhost, { marginTop: 10 }]} onPress={() => setScreen('courseHome')}>
            <Text style={s.btnGhostTxt}>Back to Course</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );

    // ── Word view ──
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar backgroundColor={DARK_INDIGO} barStyle="light-content" />

        <View style={s.header}>
          <TouchableOpacity onPress={() => setScreen('courseHome')} style={{ width: 50 }}>
            <Text style={s.headerBack}>‹</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Day {day}</Text>
          <Text style={s.headerSmall}>
            B{bIdx + 1} · {wordIdx + 1}/{batch.length}
          </Text>
        </View>

        {/* Segment progress bar */}
        <View style={s.segBar}>
          {activeBatches.map((b, i) => (
            <View
              key={b}
              style={[
                s.seg,
                i < sessionIdx  && s.segDone,
                i === sessionIdx && s.segActive,
                { flex: getBatch(courseData.words, b).length },
              ]}
            />
          ))}
        </View>

        <View style={s.learnBox}>
          {/* History dots */}
          <View style={s.histRow}>
            {[1,2,3,4,5,6,7,8].map(d => {
              const r = hist[d];
              if (r === undefined) return <View key={d} style={s.dotEmpty} />;
              return (
                <View key={d} style={[s.dot, r ? s.dotOk : s.dotBad]}>
                  <Text style={s.dotTxt}>{d}</Text>
                </View>
              );
            })}
          </View>

          {/* Word card */}
          <View style={s.wordCard}>
            <Text style={s.wordTxt}>{word?.word}</Text>
          </View>

          {/* Reveal / Answer buttons */}
          {showMeaning ? (
            <>
              <View style={s.meaningCard}>
                <Text style={s.meaningTxt}>{word?.meaning}</Text>
              </View>
              <View style={s.answerRow}>
                <TouchableOpacity style={s.btnWrong} onPress={() => recordAnswer(false)}>
                  <Text style={s.btnAnswerTxt}>✕  Wrong</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnCorrect} onPress={() => recordAnswer(true)}>
                  <Text style={s.btnAnswerTxt}>✓  Correct</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <TouchableOpacity style={s.btnReveal} onPress={() => setShowMeaning(true)}>
              <Text style={s.btnRevealTxt}>Reveal Meaning</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return null;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: BG },
  pad:           { padding: 16 },
  header:        { backgroundColor: DARK_INDIGO, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle:   { color: '#fff', fontSize: 20, fontWeight: '800' },
  headerSub:     { color: '#A5B4FC', fontSize: 12 },
  headerBack:    { color: '#A5B4FC', fontSize: 24 },
  headerSmall:   { color: '#A5B4FC', fontSize: 12, width: 80, textAlign: 'right' },
  label:         { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 1, marginBottom: 10 },
  muted:         { color: '#9CA3AF', fontStyle: 'italic', marginBottom: 16 },
  muted2:        { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  card:          { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 12 },
  row:           { flexDirection: 'row', gap: 8, marginBottom: 16 },
  courseRow:     { backgroundColor: '#fff', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  avatar:        { width: 44, height: 44, borderRadius: 22, backgroundColor: INDIGO, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText:    { color: '#fff', fontSize: 20, fontWeight: '700' },
  courseName:    { fontSize: 16, fontWeight: '600', color: '#1F2937' },
  chevron:       { color: '#D1D5DB', fontSize: 28 },
  statBox:       { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  statNum:       { fontSize: 26, fontWeight: '800', color: INDIGO },
  statLbl:       { fontSize: 10, color: '#6B7280', textAlign: 'center', marginTop: 2 },
  batchRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  badge:         { backgroundColor: '#EEF2FF', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginRight: 10 },
  badgeTxt:      { color: INDIGO, fontWeight: '700', fontSize: 12 },
  batchInfo:     { color: '#374151', fontSize: 13 },
  input:         { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 12, fontSize: 16, color: '#1F2937', marginBottom: 12 },
  uploadHint:    { fontSize: 14, color: '#6B7280', lineHeight: 22, marginBottom: 16 },
  mono:          { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', color: '#374151' },
  btnPrimary:    { backgroundColor: INDIGO, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 4 },
  btnPrimaryTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnGhost:      { borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#D1D5DB' },
  btnGhostTxt:   { color: '#6B7280', fontSize: 15, fontWeight: '600' },
  segBar:        { flexDirection: 'row', height: 4, backgroundColor: '#E5E7EB' },
  seg:           { backgroundColor: '#E5E7EB' },
  segDone:       { backgroundColor: '#10B981' },
  segActive:     { backgroundColor: INDIGO },
  learnBox:      { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' },
  histRow:       { flexDirection: 'row', gap: 6, marginBottom: 28 },
  dot:           { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  dotEmpty:      { width: 30, height: 30, borderRadius: 15, backgroundColor: '#E5E7EB' },
  dotOk:         { backgroundColor: '#10B981' },
  dotBad:        { backgroundColor: '#EF4444' },
  dotTxt:        { color: '#fff', fontSize: 11, fontWeight: '700' },
  wordCard:      { backgroundColor: '#fff', borderRadius: 20, padding: 36, alignItems: 'center', width: '100%', marginBottom: 20, borderWidth: 1, borderColor: '#E5E7EB', elevation: 2 },
  wordTxt:       { fontSize: 40, fontWeight: '800', color: '#1F2937', textAlign: 'center' },
  meaningCard:   { backgroundColor: '#EEF2FF', borderRadius: 16, padding: 20, alignItems: 'center', width: '100%', marginBottom: 20 },
  meaningTxt:    { fontSize: 24, fontWeight: '600', color: INDIGO, textAlign: 'center' },
  answerRow:     { flexDirection: 'row', gap: 12, width: '100%' },
  btnWrong:      { flex: 1, backgroundColor: '#EF4444', borderRadius: 14, padding: 18, alignItems: 'center' },
  btnCorrect:    { flex: 1, backgroundColor: '#10B981', borderRadius: 14, padding: 18, alignItems: 'center' },
  btnAnswerTxt:  { color: '#fff', fontSize: 17, fontWeight: '700' },
  btnReveal:     { backgroundColor: INDIGO, borderRadius: 14, paddingVertical: 18, paddingHorizontal: 48 },
  btnRevealTxt:  { color: '#fff', fontSize: 18, fontWeight: '700' },
  centerBox:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  doneTitle:     { fontSize: 28, fontWeight: '800', color: '#1F2937', marginBottom: 8, marginTop: 16 },
  doneSub:       { fontSize: 16, color: '#6B7280', textAlign: 'center', lineHeight: 24, marginBottom: 32 },
});