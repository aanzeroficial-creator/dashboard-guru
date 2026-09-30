// Firebase JS SDK v10 Integration for Dashboard Guru (game-edu-da178)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    onSnapshot, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase Configuration from User Credentials
const firebaseConfig = {
    apiKey: "AIzaSyDOgmxnWEFkoE4WzUXvqYlK_zkxdSQLI6k",
    authDomain: "game-edu-da178.firebaseapp.com",
    projectId: "game-edu-da178",
    storageBucket: "game-edu-da178.firebasestorage.app",
    messagingSenderId: "152391523724",
    appId: "1:152391523724:web:21bf1703d59a93f4c6caa9",
    measurementId: "G-YS5E0N1GTB"
};

// Default Fallback Store Items
const defaultItems = [
    {
        id: "local-1",
        name: "Pensil 2B Kebahagiaan",
        price: 3000,
        category: "alat_tulis",
        icon: "res://assset game masak 2d/Sprites/Sprites/Icons/chalk1_chalk.png",
        desc: "Pensil 2B kualitas tinggi untuk menulis di kelas"
    },
    {
        id: "local-2",
        name: "Buku Tulis Sekolah",
        price: 5000,
        category: "alat_tulis",
        icon: "res://assset game masak 2d/Sprites/Sprites/Environment/Shelf/books.png",
        desc: "Buku tulis bergaris untuk catatan pelajaran"
    },
    {
        id: "local-3",
        name: "Roti Coklat Bergizi",
        price: 5000,
        category: "makanan",
        icon: "res://assset game masak 2d/Sprites/Sprites/Icons/bread_chalk.png",
        desc: "Roti empuk selai coklat bergizi"
    },
    {
        id: "local-4",
        name: "Susu Kotak UHT",
        price: 6000,
        category: "makanan",
        icon: "res://assset game masak 2d/Sprites/Sprites/Icons/milk_chalk.png",
        desc: "Susu segar kalsium tinggi untuk kesehatan"
    }
];

let app, db;
let shopItemsList = [];
let currentCategoryFilter = "all";
let isFirebaseOnline = false;
let lastStudentList = [];
let presenceCheckInterval = null;


// Initialize App
document.addEventListener("DOMContentLoaded", () => {
    initFirebase();
    setupNavigation();
    setupFormEvents();
    setupCategoryFilter();
    setupExportAndSync();
    setupQuizEvents();
});

let quizViewMode = "master-detail"; // "master-detail" atau "table"

function setupQuizEvents() {
    const searchInput = document.getElementById("searchQuizStudent");
    const classFilter = document.getElementById("filterQuizClass");
    const btnExport = document.getElementById("btnExportQuizCSV");
    const btnMasterDetail = document.getElementById("btnViewMasterDetail");
    const btnTable = document.getElementById("btnViewTable");

    if (searchInput) {
        searchInput.addEventListener("input", () => renderQuizResultsMonitor());
    }
    if (classFilter) {
        classFilter.addEventListener("change", () => renderQuizResultsMonitor());
    }
    if (btnExport) {
        btnExport.addEventListener("click", () => downloadQuizCSV());
    }
    if (btnMasterDetail) {
        btnMasterDetail.addEventListener("click", () => switchQuizViewMode("master-detail"));
    }
    if (btnTable) {
        btnTable.addEventListener("click", () => switchQuizViewMode("table"));
    }

    updateClassDropdownFilter();
    renderQuizResultsMonitor();
}

window.switchQuizViewMode = function(mode) {
    quizViewMode = mode;
    const containerMD = document.getElementById("quizMasterDetailViewContainer");
    const containerTable = document.getElementById("quizTableViewContainer");
    const btnMD = document.getElementById("btnViewMasterDetail");
    const btnTab = document.getElementById("btnViewTable");

    if (mode === "master-detail") {
        if (containerMD) containerMD.classList.remove("hidden");
        if (containerTable) containerTable.classList.add("hidden");
        if (btnMD) {
            btnMD.style.background = "#7C3AED";
            btnMD.style.color = "white";
        }
        if (btnTab) {
            btnTab.style.background = "transparent";
            btnTab.style.color = "#64748b";
        }
    } else {
        if (containerMD) containerMD.classList.add("hidden");
        if (containerTable) containerTable.classList.remove("hidden");
        if (btnMD) {
            btnMD.style.background = "transparent";
            btnMD.style.color = "#64748b";
        }
        if (btnTab) {
            btnTab.style.background = "#7C3AED";
            btnTab.style.color = "white";
        }
    }
    renderQuizResultsMonitor();
};

// Initialize Firebase & Listen Real-Time
function initFirebase() {
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        
        const itemsRef = collection(db, "shop_items");
        
        onSnapshot(itemsRef, (snapshot) => {
            isFirebaseOnline = true;
            shopItemsList = [];
            snapshot.forEach((docSnap) => {
                shopItemsList.push({
                    id: docSnap.id,
                    ...docSnap.data()
                });
            });
            
            renderItemsGrid();
            showToast("✅ Berhasil menyinkronkan data dari Firebase Firestore!");
        }, (error) => {
            console.warn("Firestore error:", error);
            isFirebaseOnline = false;
            renderItemsGrid();
            showToast("ℹ️ Mode offline. (Set aturan Firestore ke Public jika error permission)");
        });

        // Listen Real-Time Student Logins with Presence Timeout
        const loginsRef = collection(db, "student_logins");
        onSnapshot(loginsRef, (snapshot) => {
            lastStudentList = [];
            const nowUnix = Math.floor(Date.now() / 1000);

            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                let name = "Siswa";
                let className = "-";
                let time = "-";
                let rawStatus = "Online 🟢";
                let lastPing = 0;

                if (data.student_name) name = data.student_name.stringValue || data.student_name;
                if (data.student_class) className = data.student_class.stringValue || data.student_class;
                if (data.login_time) time = data.login_time.stringValue || data.login_time;
                if (data.status) rawStatus = data.status.stringValue || data.status;
                if (data.last_ping) {
                    lastPing = typeof data.last_ping === 'object' ? parseInt(data.last_ping.integerValue || data.last_ping.doubleValue || 0) : parseInt(data.last_ping);
                }

                // Kalkulasi keaktifan real-time presence:
                // Siswa HANYA dianggap Online 🟢 jika status memuat Online DAN memiliki last_ping aktif dalam 30 detik terakhir
                const isOnline = (rawStatus.includes("Online") || rawStatus.includes("🟢")) && lastPing > 0 && (nowUnix - lastPing <= 30);

                lastStudentList.push({
                    id: docSnap.id,
                    name,
                    class: className,
                    time,
                    status: isOnline ? "Online 🟢" : "Offline 🔴",
                    isOnline,
                    lastPing
                });
            });

            renderStudentLoginsMonitor(lastStudentList);
        }, (error) => {
            console.warn("Logins listener error:", error);
        });

        // Auto re-evaluate student presence timeout every 5 seconds
        if (!presenceCheckInterval) {
            presenceCheckInterval = setInterval(() => {
                if (lastStudentList.length > 0) {
                    const nowUnix = Math.floor(Date.now() / 1000);
                    lastStudentList.forEach(s => {
                        if (s.isOnline) {
                            if (s.lastPing === 0 || (nowUnix - s.lastPing > 30)) {
                                s.isOnline = false;
                                s.status = "Offline 🔴";
                            }
                        }
                    });
                    renderStudentLoginsMonitor(lastStudentList);
                }
            }, 5000);
        }



        // Listen Real-Time Student Quiz Results
        const quizResultsRef = collection(db, "student_quiz_results");

        onSnapshot(quizResultsRef, (snapshot) => {
            quizResultsList = [];
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                let name = "Siswa";
                let className = "5A";
                let title = "Kuis";
                let score = 0;
                let time = "-";

                if (data.student_name) name = data.student_name.stringValue || data.student_name;
                if (data.student_class) className = data.student_class.stringValue || data.student_class;
                if (data.quiz_title) title = data.quiz_title.stringValue || data.quiz_title;
                if (data.score !== undefined) {
                    score = typeof data.score === 'object' ? (data.score.integerValue || data.score.doubleValue || 0) : data.score;
                }
                if (data.timestamp) time = data.timestamp.stringValue || data.timestamp;

                quizResultsList.push({
                    id: docSnap.id,
                    name,
                    class: className,
                    title,
                    score: parseInt(score),
                    time
                });
            });

            updateClassDropdownFilter();
            renderQuizResultsMonitor();
        }, (error) => {
            console.warn("Quiz results listener error:", error);
        });

    } catch (e) {
        console.error("Firebase init error:", e);
        renderItemsGrid();
    }
}

let quizResultsList = [];
let selectedStudentKey = null;

const defaultQuizResults = [
    { id: "demo-q1", name: "Aldo Septian", class: "5A", title: "Kuis Babak 1", score: 85, time: "2026-09-30 08:30" },
    { id: "demo-q2", name: "Aldo Septian", class: "5A", title: "Kuis Babak 2", score: 90, time: "2026-09-30 09:15" },
    { id: "demo-q3", name: "Aldo Septian", class: "5A", title: "Asesmen Akhir", score: 95, time: "2026-09-30 10:00" },

    { id: "demo-q4", name: "Budi Santoso", class: "5A", title: "Kuis Babak 1", score: 70, time: "2026-09-30 08:32" },
    { id: "demo-q5", name: "Budi Santoso", class: "5A", title: "Kuis Babak 2", score: 75, time: "2026-09-30 09:20" },
    { id: "demo-q6", name: "Budi Santoso", class: "5A", title: "Asesmen Akhir", score: 60, time: "2026-09-30 10:05" },

    { id: "demo-q7", name: "Citra Dewi", class: "5B", title: "Kuis Babak 1", score: 100, time: "2026-09-30 08:40" },
    { id: "demo-q8", name: "Citra Dewi", class: "5B", title: "Kuis Babak 2", score: 95, time: "2026-09-30 09:30" },
    { id: "demo-q9", name: "Citra Dewi", class: "5B", title: "Asesmen Akhir", score: 90, time: "2026-09-30 10:15" }
];

function calculateStudentAccumulatedGrade(quizzes) {
    let q1 = null, q2 = null, q3 = null;

    quizzes.forEach(q => {
        const titleLower = (q.title || "").toLowerCase();
        if (titleLower.includes("babak 1") || titleLower.includes("kuis 1") || titleLower.includes("kuis babak 1")) {
            if (!q1 || q.score > q1.score) q1 = q;
        } else if (titleLower.includes("babak 2") || titleLower.includes("kuis 2") || titleLower.includes("kuis babak 2")) {
            if (!q2 || q.score > q2.score) q2 = q;
        } else if (titleLower.includes("asesmen") || titleLower.includes("babak 3") || titleLower.includes("kuis 3") || titleLower.includes("kuis babak 3")) {
            if (!q3 || q.score > q3.score) q3 = q;
        }
    });

    // Fallback: Jika ada kuis yang belum teridentifikasi dari judul, petakan secara berurutan
    const remainingQuizzes = quizzes.filter(q => q !== q1 && q !== q2 && q !== q3);
    if (!q1 && remainingQuizzes.length > 0) q1 = remainingQuizzes.shift();
    if (!q2 && remainingQuizzes.length > 0) q2 = remainingQuizzes.shift();
    if (!q3 && remainingQuizzes.length > 0) q3 = remainingQuizzes.shift();

    const s1 = q1 ? q1.score : 0;
    const s2 = q2 ? q2.score : 0;
    const s3 = q3 ? q3.score : 0;

    const contrib1 = s1 * 0.20;
    const contrib2 = s2 * 0.40;
    const contrib3 = s3 * 0.40;

    const finalScore = parseFloat((contrib1 + contrib2 + contrib3).toFixed(1));
    const takenCount = (q1 ? 1 : 0) + (q2 ? 1 : 0) + (q3 ? 1 : 0);

    return {
        q1: q1 ? { score: s1, title: q1.title, contrib: contrib1 } : null,
        q2: q2 ? { score: s2, title: q2.title, contrib: contrib2 } : null,
        q3: q3 ? { score: s3, title: q3.title, contrib: contrib3 } : null,
        finalScore,
        takenCount,
        isComplete: takenCount === 3,
        passed: finalScore >= 75
    };
}

function updateClassDropdownFilter() {
    const select = document.getElementById("filterQuizClass");
    if (!select) return;

    let sourceData = quizResultsList.length > 0 ? quizResultsList : defaultQuizResults;
    const classes = new Set(["all"]);
    sourceData.forEach(q => { if (q.class) classes.add(q.class); });

    let html = `<option value="all">Semua Kelas</option>`;
    classes.forEach(c => {
        if (c !== "all") html += `<option value="${escapeHtml(c)}">Kelas ${escapeHtml(c)}</option>`;
    });
    select.innerHTML = html;
}

function renderQuizResultsMonitor() {
    const masterList = document.getElementById("studentMasterList");
    const detailView = document.getElementById("studentDetailView");
    const statStudents = document.getElementById("statTotalStudents");
    const statAvg = document.getElementById("statAvgScore");
    const statPassed = document.getElementById("statPassedCount");
    const statRemedial = document.getElementById("statRemedialCount");
    const countBadge = document.getElementById("studentCountBadge");
    const searchVal = (document.getElementById("searchQuizStudent")?.value || "").toLowerCase().trim();
    const classVal = document.getElementById("filterQuizClass")?.value || "all";

    if (!masterList || !detailView) return;

    let sourceData = quizResultsList.length > 0 ? quizResultsList : defaultQuizResults;

    let filtered = sourceData;
    if (classVal !== "all") {
        filtered = filtered.filter(q => q.class === classVal);
    }
    if (searchVal !== "") {
        filtered = filtered.filter(q => q.name.toLowerCase().includes(searchVal) || q.class.toLowerCase().includes(searchVal) || q.title.toLowerCase().includes(searchVal));
    }

    // Group items by student key ("Name__Class")
    const studentMap = new Map();
    filtered.forEach(q => {
        const key = `${q.name}__${q.class}`;
        if (!studentMap.has(key)) {
            studentMap.set(key, {
                name: q.name,
                class: q.class,
                quizzes: []
            });
        }
        studentMap.get(key).quizzes.push(q);
    });

    const students = Array.from(studentMap.values());
    if (countBadge) countBadge.textContent = `${students.length} Siswa`;

    // Compute Overall Statistics across students
    let sumAccum = 0;
    let passedCount = 0;
    let remedialCount = 0;

    students.forEach(s => {
        const accum = calculateStudentAccumulatedGrade(s.quizzes);
        sumAccum += accum.finalScore;
        if (accum.passed) passedCount++;
        else remedialCount++;
    });

    const avgAccum = students.length > 0 ? (sumAccum / students.length).toFixed(1) : "0";

    if (statStudents) statStudents.textContent = students.length;
    if (statAvg) statAvg.textContent = avgAccum;
    if (statPassed) statPassed.textContent = passedCount;
    if (statRemedial) statRemedial.textContent = remedialCount;

    if (students.length === 0) {
        masterList.innerHTML = `<div class="empty-state-banner"><p>Belum ada data siswa.</p></div>`;
        detailView.innerHTML = `<div class="empty-state-banner"><p>Belum ada data nilai kuis siswa yang tersimpan.</p></div>`;
        renderQuizTableView([]);
        return;
    }

    if (!selectedStudentKey || !students.some(s => `${s.name}__${s.class}` === selectedStudentKey)) {
        selectedStudentKey = `${students[0].name}__${students[0].class}`;
    }

    // Render Master Student List (Left Column)
    let masterHtml = "";
    students.forEach(s => {
        const sKey = `${s.name}__${s.class}`;
        const isSelected = (sKey === selectedStudentKey);
        const avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(s.name)}`;
        const accum = calculateStudentAccumulatedGrade(s.quizzes);

        let scoreBadgeColor = "#10B981";
        if (accum.finalScore < 60) scoreBadgeColor = "#EF4444";
        else if (accum.finalScore < 75) scoreBadgeColor = "#F59E0B";

        const bg = isSelected ? "#F3E8FF" : "#ffffff";
        const border = isSelected ? "#8B5CF6" : "#e2e8f0";

        masterHtml += `
            <div onclick="selectStudentForQuiz('${escapeHtml(sKey)}')" 
                 style="background: ${bg}; border: 2px solid ${border}; border-radius: 10px; padding: 10px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; transition: all 0.2s ease;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <img src="${avatar}" style="width: 36px; height: 36px; border-radius: 50%; background: #e2e8f0;">
                    <div>
                        <div style="font-weight: 700; font-size: 13px; color: #1e293b;">${escapeHtml(s.name)}</div>
                        <div style="font-size: 11px; color: #64748b; font-weight: 600;">Kelas ${escapeHtml(s.class)} • ${s.quizzes.length} Kuis</div>
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="background: ${scoreBadgeColor}22; color: ${scoreBadgeColor}; font-size: 12px; font-weight: 800; padding: 4px 8px; border-radius: 8px;">
                        ${accum.finalScore}
                    </div>
                    <div style="font-size: 9px; color: #64748b; font-weight: 700; margin-top: 2px;">AKUMULASI</div>
                </div>
            </div>
        `;
    });

    masterList.innerHTML = masterHtml;

    // Render Selected Student's Detail View (Right Column)
    renderStudentDetailView(studentMap.get(selectedStudentKey));

    // Render Table View (Mode 2)
    renderQuizTableView(students);
}

window.selectStudentForQuiz = function(sKey) {
    selectedStudentKey = sKey;
    renderQuizResultsMonitor();
};

function renderStudentDetailView(studentObj) {
    const detailView = document.getElementById("studentDetailView");
    if (!detailView || !studentObj) return;

    const avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(studentObj.name)}`;
    const accum = calculateStudentAccumulatedGrade(studentObj.quizzes);

    let detailHtml = `
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 14px; flex-wrap: wrap; gap: 10px;">
            <div style="display: flex; align-items: center; gap: 12px;">
                <img src="${avatar}" style="width: 52px; height: 52px; border-radius: 50%; background: #edf2f7; border: 2px solid #8B5CF6;">
                <div>
                    <h4 style="margin: 0; font-size: 16px; font-weight: 800; color: #1e293b;">${escapeHtml(studentObj.name)}</h4>
                    <p style="margin: 2px 0 0 0; font-size: 12px; color: #64748b; font-weight: 600;">Kelas ${escapeHtml(studentObj.class)} • Total Kuis: ${studentObj.quizzes.length}</p>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <button onclick="deleteStudentAllResults('${escapeHtml(studentObj.name)}', '${escapeHtml(studentObj.class)}')" 
                        style="background: #FEF2F2; color: #EF4444; border: 1.5px solid #FCA5A5; border-radius: 8px; padding: 7px 10px; font-size: 11px; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s ease;">
                    🗑️ Hapus Data Siswa Ini
                </button>
            </div>
        </div>

        <!-- Box Card Akumulasi Nilai (Weighted 20% - 40% - 40%) -->
        <div style="background: linear-gradient(135deg, #F3E8FF 0%, #EDE9FE 100%); border: 2px solid #DDD6FE; border-radius: 14px; padding: 14px; margin-bottom: 16px; box-shadow: 0 4px 12px rgba(124, 58, 237, 0.06);">
            <div style="font-size: 12px; font-weight: 800; color: #6D28D9; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;">
                <span>🧮 AKUMULASI NILAI AKHIR (BOBOT: 20% + 40% + 40%)</span>
                <span style="font-size: 11px; background: #ffffff; padding: 3px 10px; border-radius: 12px; color: ${accum.passed ? '#059669' : '#DC2626'}; border: 1.5px solid ${accum.passed ? '#A7F3D0' : '#FCA5A5'}; font-weight: 800;">
                    ${accum.passed ? '✅ TUNTAS KKM (≥75)' : '⚠️ BELUM TUNTAS (<75)'}
                </span>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 12px;">
                <!-- Kuis 1 -->
                <div style="background: white; border: 1.5px solid #E9D5FF; border-radius: 10px; padding: 10px; text-align: center;">
                    <div style="font-size: 11px; font-weight: 700; color: #6B21A8;">Kuis 1 (Bobot 20%)</div>
                    <div style="font-size: 20px; font-weight: 900; color: ${accum.q1 ? '#1E293B' : '#94A3B8'}; margin: 2px 0;">
                        ${accum.q1 ? accum.q1.score : '-'}
                    </div>
                    <div style="font-size: 10px; font-weight: 700; color: #7C3AED; background: #F3E8FF; padding: 2px 6px; border-radius: 6px; display: inline-block;">
                        +${accum.q1 ? accum.q1.contrib.toFixed(1) : '0.0'} pt
                    </div>
                </div>

                <!-- Kuis 2 -->
                <div style="background: white; border: 1.5px solid #E9D5FF; border-radius: 10px; padding: 10px; text-align: center;">
                    <div style="font-size: 11px; font-weight: 700; color: #6B21A8;">Kuis 2 (Bobot 40%)</div>
                    <div style="font-size: 20px; font-weight: 900; color: ${accum.q2 ? '#1E293B' : '#94A3B8'}; margin: 2px 0;">
                        ${accum.q2 ? accum.q2.score : '-'}
                    </div>
                    <div style="font-size: 10px; font-weight: 700; color: #7C3AED; background: #F3E8FF; padding: 2px 6px; border-radius: 6px; display: inline-block;">
                        +${accum.q2 ? accum.q2.contrib.toFixed(1) : '0.0'} pt
                    </div>
                </div>

                <!-- Kuis 3 -->
                <div style="background: white; border: 1.5px solid #E9D5FF; border-radius: 10px; padding: 10px; text-align: center;">
                    <div style="font-size: 11px; font-weight: 700; color: #6B21A8;">Kuis 3 / Asesmen (40%)</div>
                    <div style="font-size: 20px; font-weight: 900; color: ${accum.q3 ? '#1E293B' : '#94A3B8'}; margin: 2px 0;">
                        ${accum.q3 ? accum.q3.score : '-'}
                    </div>
                    <div style="font-size: 10px; font-weight: 700; color: #7C3AED; background: #F3E8FF; padding: 2px 6px; border-radius: 6px; display: inline-block;">
                        +${accum.q3 ? accum.q3.contrib.toFixed(1) : '0.0'} pt
                    </div>
                </div>
            </div>

            <!-- Formula Summary Footer -->
            <div style="display: flex; align-items: center; justify-content: space-between; background: #ffffff; padding: 10px 14px; border-radius: 10px; border: 1.5px solid #C084FC; flex-wrap: wrap; gap: 8px;">
                <div>
                    <div style="font-size: 10px; color: #64748B; font-weight: 700;">RUMUS AKUMULASI</div>
                    <div style="font-size: 12px; font-weight: 700; color: #4C1D95;">
                        (${accum.q1 ? accum.q1.score : 0} × 0.2) + (${accum.q2 ? accum.q2.score : 0} × 0.4) + (${accum.q3 ? accum.q3.score : 0} × 0.4)
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 10px; color: #6B21A8; font-weight: 700;">NILAI AKHIR AKUMULASI</div>
                    <div style="font-size: 24px; font-weight: 900; color: ${accum.passed ? '#059669' : '#DC2626'}; line-height: 1;">
                        ${accum.finalScore} <span style="font-size: 13px; font-weight: 600; color: #64748B;">/ 100</span>
                    </div>
                </div>
            </div>
        </div>

        <h5 style="margin: 0 0 10px 0; font-size: 13px; color: #475569; font-weight: 700;">📋 Riwayat Pengerjaan Kuis:</h5>
        <div style="display: flex; flex-direction: column; gap: 10px; overflow-y: auto; max-height: 260px;">
    `;

    studentObj.quizzes.forEach(q => {
        let badgeBg = "#10B981";
        let predikat = "Lulus Sempurna 🌟";
        let evalText = "Siswa telah menguasai seluruh materi edukasi ekonomi ini dengan baik!";

        if (q.score < 50) {
            badgeBg = "#EF4444";
            predikat = "Perlu Remedial 📖";
            evalText = "Siswa perlu mengulang kembali materi dan berdiskusi bersama guru.";
        } else if (q.score < 80) {
            badgeBg = "#F59E0B";
            predikat = "Cukup Baik 👍";
            evalText = "Siswa sudah cukup memahami konsep dasar, namun perlu lebih teliti pada pilihan soal.";
        }

        detailHtml += `
            <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 12px; display: flex; align-items: center; justify-content: space-between;">
                <div>
                    <div style="font-weight: 800; font-size: 14px; color: #1e293b;">${escapeHtml(q.title)}</div>
                    <div style="font-size: 11px; color: #64748b; margin-top: 2px;">⏰ Selesai pada: ${escapeHtml(q.time)}</div>
                    <div style="font-size: 11px; color: #475569; margin-top: 4px; font-style: italic;">💡 Evaluation Note: "${evalText}"</div>
                    <div style="margin-top: 6px;">
                        <button onclick="deleteQuizResult('${q.id}', '${escapeHtml(q.name)}')" 
                                style="background: #FEE2E2; color: #DC2626; border: 1px solid #FCA5A5; border-radius: 6px; padding: 3px 8px; font-size: 11px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s ease;">
                            🗑️ Hapus Hasil Ini
                        </button>
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 18px; font-weight: 900; color: ${badgeBg};">${q.score} / 100</div>
                    <span style="display: inline-block; margin-top: 4px; background: ${badgeBg}22; color: ${badgeBg}; font-weight: 700; padding: 3px 8px; border-radius: 10px; font-size: 10px;">${predikat}</span>
                </div>
            </div>
        `;
    });

    detailHtml += `</div>`;
    detailView.innerHTML = detailHtml;
}

function renderQuizTableView(students) {
    const tableContainer = document.getElementById("quizTableContent");
    if (!tableContainer) return;

    if (!students || students.length === 0) {
        tableContainer.innerHTML = `<div class="empty-state-banner"><p>Belum ada data siswa untuk ditampilkan dalam tabel.</p></div>`;
        return;
    }

    let tableHtml = `
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
            <thead>
                <tr style="background: #7C3AED; color: white; font-weight: 700;">
                    <th style="padding: 10px 12px; border-top-left-radius: 8px;">No</th>
                    <th style="padding: 10px 12px;">Nama Siswa</th>
                    <th style="padding: 10px 12px;">Kelas</th>
                    <th style="padding: 10px 12px; text-align: center;">Kuis 1 (20%)</th>
                    <th style="padding: 10px 12px; text-align: center;">Kuis 2 (40%)</th>
                    <th style="padding: 10px 12px; text-align: center;">Kuis 3 / Asesmen (40%)</th>
                    <th style="padding: 10px 12px; text-align: center;">Nilai Akhir (Akumulasi)</th>
                    <th style="padding: 10px 12px; text-align: center; border-top-right-radius: 8px;">Status KKM</th>
                </tr>
            </thead>
            <tbody>
    `;

    students.forEach((s, idx) => {
        const accum = calculateStudentAccumulatedGrade(s.quizzes);
        const q1Val = accum.q1 ? accum.q1.score : "-";
        const q2Val = accum.q2 ? accum.q2.score : "-";
        const q3Val = accum.q3 ? accum.q3.score : "-";
        const bgRow = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
        const statusBadge = accum.passed 
            ? `<span style="background: #DEF7EC; color: #03543F; font-weight: 800; padding: 4px 10px; border-radius: 12px; font-size: 11px;">TUNTAS (≥75)</span>`
            : `<span style="background: #FDE8E8; color: #9B1C1C; font-weight: 800; padding: 4px 10px; border-radius: 12px; font-size: 11px;">REMEDIAL (&lt;75)</span>`;

        tableHtml += `
            <tr style="background: ${bgRow}; border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 12px; font-weight: 700; color: #64748b;">${idx + 1}</td>
                <td style="padding: 10px 12px; font-weight: 800; color: #1e293b;">${escapeHtml(s.name)}</td>
                <td style="padding: 10px 12px; font-weight: 600; color: #475569;">${escapeHtml(s.class)}</td>
                <td style="padding: 10px 12px; text-align: center; font-weight: 700; color: #4C1D95;">${q1Val}</td>
                <td style="padding: 10px 12px; text-align: center; font-weight: 700; color: #4C1D95;">${q2Val}</td>
                <td style="padding: 10px 12px; text-align: center; font-weight: 700; color: #4C1D95;">${q3Val}</td>
                <td style="padding: 10px 12px; text-align: center; font-weight: 900; font-size: 15px; color: ${accum.passed ? '#059669' : '#DC2626'};">${accum.finalScore}</td>
                <td style="padding: 10px 12px; text-align: center;">${statusBadge}</td>
            </tr>
        `;
    });

    tableHtml += `
            </tbody>
        </table>
    `;

    tableContainer.innerHTML = tableHtml;
}

// Window Expose Delete Quiz Functions
window.deleteQuizResult = async function(id, name) {
    if (!confirm(`Apakah Anda yakin ingin menghapus 1 hasil kuis ini milik "${name}"?`)) return;
    try {
        if (isFirebaseOnline && id && !id.startsWith("demo-") && !id.startsWith("local-")) {
            await deleteDoc(doc(db, "student_quiz_results", id));
            showToast(`🗑️ Hasil kuis "${name}" berhasil dihapus dari Firestore!`);
        } else {
            quizResultsList = quizResultsList.filter(q => q.id !== id);
            renderQuizResultsMonitor();
            showToast(`🗑️ Hasil kuis "${name}" berhasil dihapus!`);
        }
    } catch (err) {
        console.error("Delete quiz error:", err);
        quizResultsList = quizResultsList.filter(q => q.id !== id);
        renderQuizResultsMonitor();
        showToast(`🗑️ Hasil kuis "${name}" berhasil dihapus!`);
    }
};

window.deleteStudentAllResults = async function(name, className) {
    if (!confirm(`⚠️ PERINGATAN: Apakah Anda yakin ingin menghapus SELURUH hasil belajar dan nilai kuis milik siswa "${name}" (Kelas ${className})?`)) return;
    try {
        const toDelete = quizResultsList.filter(q => q.name === name && q.class === className);
        for (const item of toDelete) {
            if (isFirebaseOnline && item.id && !item.id.startsWith("demo-") && !item.id.startsWith("local-")) {
                await deleteDoc(doc(db, "student_quiz_results", item.id));
            }
        }
        quizResultsList = quizResultsList.filter(q => !(q.name === name && q.class === className));
        selectedStudentKey = null;
        renderQuizResultsMonitor();
        showToast(`🗑️ Seluruh data hasil belajar "${name}" berhasil dihapus!`);
    } catch (err) {
        console.error("Delete all student results error:", err);
        quizResultsList = quizResultsList.filter(q => !(q.name === name && q.class === className));
        selectedStudentKey = null;
        renderQuizResultsMonitor();
        showToast(`🗑️ Data siswa "${name}" berhasil dibersihkan!`);
    }
};

function downloadQuizCSV() {
    let sourceData = quizResultsList.length > 0 ? quizResultsList : defaultQuizResults;

    if (sourceData.length === 0) {
        showToast("⚠️ Belum ada data nilai kuis untuk diunduh.");
        return;
    }

    // Group by student
    const studentMap = new Map();
    sourceData.forEach(q => {
        const key = `${q.name}__${q.class}`;
        if (!studentMap.has(key)) {
            studentMap.set(key, { name: q.name, class: q.class, quizzes: [] });
        }
        studentMap.get(key).quizzes.push(q);
    });

    let csvContent = "data:text/csv;charset=utf-8,No,Nama Siswa,Kelas,Kuis 1 (20%),Kuis 2 (40%),Kuis 3 (40%),Nilai Akhir (Akumulasi),Status KKM\n";

    let index = 1;
    studentMap.forEach(s => {
        const accum = calculateStudentAccumulatedGrade(s.quizzes);
        const q1Text = accum.q1 ? accum.q1.score : "-";
        const q2Text = accum.q2 ? accum.q2.score : "-";
        const q3Text = accum.q3 ? accum.q3.score : "-";
        const statusText = accum.passed ? "TUNTAS (>=75)" : "REMEDIAL (<75)";

        csvContent += `${index},"${s.name}","${s.class}",${q1Text},${q2Text},${q3Text},${accum.finalScore},"${statusText}"\n`;
        index++;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Rekap_Akumulasi_Nilai_Kuis_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast("📥 File Rekap Akumulasi Nilai CSV berhasil diunduh!");
}

function renderStudentLoginsMonitor(studentList) {
    const badge = document.getElementById("onlineBadge");
    const container = document.getElementById("studentMonitorContainer");

    // Filter HANYA siswa yang benar-benar aktif Online 🟢
    const activeOnlineList = studentList.filter(s => s.isOnline);

    if (badge) {
        badge.textContent = `${activeOnlineList.length} Siswa Online`;
    }

    if (!container) return;

    if (activeOnlineList.length === 0) {
        container.innerHTML = `<div class="empty-state-banner"><p>Belum ada siswa yang terdeteksi online saat ini.</p></div>`;
        return;
    }

    let html = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; margin-top: 15px;">`;
    activeOnlineList.forEach(s => {
        const avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(s.name)}`;
        const statusBg = "#DEF7EC";
        const statusColor = "#03543F";
        const borderCol = "#31C48D";
        const statusText = "Online 🟢";

        html += `
            <div style="background: #ffffff; border: 2px solid ${borderCol}; border-radius: 12px; padding: 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; box-shadow: 0 2px 6px rgba(0,0,0,0.05);">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <img src="${avatar}" style="width: 44px; height: 44px; border-radius: 50%; background: #edf2f7;">
                    <div>
                        <div style="font-weight: 700; font-size: 14px; color: #2d3748;">${escapeHtml(s.name)}</div>
                        <div style="font-size: 12px; color: #4a5568; font-weight: 600;">Kelas: ${escapeHtml(s.class)}</div>
                        <div style="font-size: 11px; color: #718096; margin-top: 2px;">⏰ ${escapeHtml(s.time)}</div>
                    </div>
                </div>
                <div style="background: ${statusBg}; color: ${statusColor}; font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 6px; white-space: nowrap;">
                    ${statusText}
                </div>
            </div>
        `;
    });
    html += `</div>`;
    container.innerHTML = html;
}



// Sidebar Tab Navigation Handler
function setupNavigation() {
    const navTabs = document.querySelectorAll(".nav-tab");
    const tabContents = document.querySelectorAll(".tab-content");

    navTabs.forEach((btn) => {
        btn.addEventListener("click", () => {
            const targetTab = btn.getAttribute("data-tab");

            navTabs.forEach(t => t.classList.remove("active"));
            btn.classList.add("active");

            tabContents.forEach(c => {
                if (c.id === `tab-${targetTab}`) {
                    c.classList.remove("hidden");
                } else {
                    c.classList.add("hidden");
                }
            });
        });
    });

    // Music toggle button
    let musicOn = true;
    const musicBtn = document.getElementById("btnMusicToggle");
    if (musicBtn) {
        musicBtn.addEventListener("click", () => {
            musicOn = !musicOn;
            musicBtn.textContent = musicOn ? "Musik: ON" : "Musik: OFF";
            musicBtn.style.backgroundColor = musicOn ? "#2ecc71" : "#7f8c8d";
        });
    }

    // Account switch button
    const accountBtn = document.getElementById("btnSwitchAccount");
    if (accountBtn) {
        accountBtn.addEventListener("click", () => {
            showToast("👤 Sesi Akun: Aan Rifai, S.Pd. (Guru Gaji Sejahtera)");
        });
    }
}

let uploadedImageDataUrl = "";

// Render Items Grid in Manajemen Toko
function renderItemsGrid() {
    const grid = document.getElementById("itemsGrid");
    if (!grid) return;

    let filtered = shopItemsList;
    if (currentCategoryFilter !== "all") {
        filtered = shopItemsList.filter(item => item.category === currentCategoryFilter);
    }

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="empty-state-banner"><p>Tidak ada barang belanja pada kategori ini.</p></div>`;
        return;
    }

    let html = "";
    filtered.forEach((item) => {
        const catLabels = {
            makanan: "Toko Makanan",
            alat_tulis: "Toko Buku & Alat",
            mainan: "Toko Mainan",
            pakaian: "Toko Pakaian"
        };
        const catLabel = catLabels[item.category] || "Toko Belanja";
        const imageSrc = item.icon && (item.icon.startsWith("http") || item.icon.startsWith("data:image")) 
            ? item.icon 
            : "https://api.dicebear.com/7.x/shapes/svg?seed=" + encodeURIComponent(item.name);

        html += `
            <div class="item-card-box">
                <div>
                    <img src="${imageSrc}" alt="${item.name}" class="item-img-preview" onerror="this.src='https://api.dicebear.com/7.x/shapes/svg?seed=item'">
                    <div class="item-name-text">${escapeHtml(item.name)}</div>
                    <div class="item-price-tag">${formatRupiah(item.price)}</div>
                    <span class="item-cat-badge">${catLabel}</span>
                </div>
                <div class="card-btn-row">
                    <button class="btn btn-sm btn-card-edit" onclick="editItem('${item.id}')">✏️ Edit</button>
                    <button class="btn btn-sm btn-card-delete" onclick="deleteItem('${item.id}')">🗑️ Hapus</button>
                </div>
            </div>
        `;
    });

    grid.innerHTML = html;
}

// Form Handlers
function setupFormEvents() {
    const form = document.getElementById("itemForm");
    const btnReset = document.getElementById("btnResetForm");
    const fileInput = document.getElementById("itemFile");
    const previewBox = document.getElementById("imagePreviewBox");
    const previewImg = document.getElementById("imagePreviewImg");
    const btnRemovePreview = document.getElementById("btnRemovePreview");

    // Handle File Selection with Automatic Canvas Optimization
    if (fileInput) {
        fileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement("canvas");
                        const maxDim = 160;
                        let w = img.width;
                        let h = img.height;
                        if (w > h) {
                            if (w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; }
                        } else {
                            if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; }
                        }
                        canvas.width = w;
                        canvas.height = h;
                        const ctx = canvas.getContext("2d");
                        ctx.drawImage(img, 0, 0, w, h);
                        uploadedImageDataUrl = canvas.toDataURL("image/png");
                        if (previewImg) previewImg.src = uploadedImageDataUrl;
                        if (previewBox) previewBox.classList.remove("hidden");
                        showToast("📷 Foto di-compress & siap disimpan ke Firebase!");
                    };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    }


    if (btnRemovePreview) {
        btnRemovePreview.addEventListener("click", () => {
            uploadedImageDataUrl = "";
            if (fileInput) fileInput.value = "";
            if (previewBox) previewBox.classList.add("hidden");
        });
    }

    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const id = document.getElementById("itemId").value;
        const name = document.getElementById("itemName").value.trim();
        const price = parseInt(document.getElementById("itemPrice").value) || 0;
        const category = document.getElementById("itemCategory").value;
        let icon = document.getElementById("itemIcon").value.trim();
        const desc = document.getElementById("itemDesc").value.trim();

        // Use uploaded photo Data URL if available
        if (uploadedImageDataUrl) {
            icon = uploadedImageDataUrl;
        } else if (!icon) {
            icon = "res://icon.svg";
        }

        if (!name || price <= 0) {
            showToast("⚠️ Mohon isi Nama Barang dan Harga secara valid!");
            return;
        }

        const itemPayload = {
            name,
            price,
            category,
            icon,
            desc,
            updatedAt: serverTimestamp()
        };

        try {
            if (id && isFirebaseOnline) {
                const docRef = doc(db, "shop_items", id);
                await updateDoc(docRef, itemPayload);
                showToast(`✅ Barang "${name}" berhasil diperbarui!`);
            } else if (isFirebaseOnline) {
                const collRef = collection(db, "shop_items");
                await addDoc(collRef, itemPayload);
                showToast(`✅ Barang "${name}" & foto berhasil disimpan ke Firebase!`);
            } else {
                if (id) {
                    const idx = shopItemsList.findIndex(i => i.id === id);
                    if (idx !== -1) shopItemsList[idx] = { id, ...itemPayload };
                } else {
                    shopItemsList.push({ id: "local-" + Date.now(), ...itemPayload });
                }
                renderItemsGrid();
                showToast(`✅ Barang "${name}" & foto tersimpan di memori lokal!`);
            }

            resetForm();
        } catch (err) {
            console.error("Save error:", err);
            showToast("❌ Gagal menyimpan data: " + err.message);
        }
    });

    if (btnReset) {
        btnReset.addEventListener("click", resetForm);
    }
}


// Edit item window expose
window.editItem = function(id) {
    const item = shopItemsList.find(i => i.id === id);
    if (!item) return;

    document.getElementById("itemId").value = item.id;
    document.getElementById("itemName").value = item.name;
    document.getElementById("itemPrice").value = item.price;
    document.getElementById("itemCategory").value = item.category || "makanan";
    document.getElementById("itemIcon").value = item.icon || "";
    document.getElementById("itemDesc").value = item.desc || "";

    document.getElementById("formModeTitle").textContent = "✏️ Edit Barang Toko";
    document.getElementById("btnSubmitForm").innerHTML = "<span>💾 Update Barang</span>";
    document.getElementById("btnResetForm").style.display = "inline-flex";

    // Auto switch to Toko tab if not active
    document.querySelector('.nav-tab[data-tab="manajementoko"]').click();
};

// Delete item window expose
window.deleteItem = async function(id) {
    const item = shopItemsList.find(i => i.id === id);
    const itemName = item ? item.name : "barang ini";

    if (!confirm(`Apakah Anda yakin ingin menghapus "${itemName}" dari Toko Game?`)) {
        return;
    }

    try {
        if (isFirebaseOnline && !id.startsWith("local-")) {
            await deleteDoc(doc(db, "shop_items", id));
            shopItemsList = shopItemsList.filter(i => i.id !== id);
            renderItemsGrid();
            showToast(`🗑️ Barang "${itemName}" berhasil dihapus!`);
        } else {
            shopItemsList = shopItemsList.filter(i => i.id !== id);
            renderItemsGrid();
            showToast(`🗑️ Barang "${itemName}" dihapus!`);
        }
    } catch (err) {
        console.error("Delete error:", err);
        shopItemsList = shopItemsList.filter(i => i.id !== id);
        renderItemsGrid();
        showToast(`🗑️ Barang "${itemName}" dihapus!`);
    }
};


function resetForm() {
    uploadedImageDataUrl = "";
    const fileInput = document.getElementById("itemFile");
    const previewBox = document.getElementById("imagePreviewBox");
    if (fileInput) fileInput.value = "";
    if (previewBox) previewBox.classList.add("hidden");

    document.getElementById("itemId").value = "";
    document.getElementById("itemName").value = "";
    document.getElementById("itemPrice").value = "";
    document.getElementById("itemCategory").value = "makanan";
    document.getElementById("itemIcon").value = "";
    document.getElementById("itemDesc").value = "";

    document.getElementById("formModeTitle").textContent = "➕ Input Barang Toko Belanja Baru";
    document.getElementById("btnSubmitForm").innerHTML = "<span>💾 Simpan ke Firebase & Game</span>";
    document.getElementById("btnResetForm").style.display = "none";
}


// Category filter buttons
function setupCategoryFilter() {
    const filterTabs = document.querySelectorAll("#filterTabs .tab-pill");
    filterTabs.forEach((pill) => {
        pill.addEventListener("click", () => {
            filterTabs.forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            currentCategoryFilter = pill.getAttribute("data-cat");
            renderItemsGrid();
        });
    });
}

// Export & Sync Button Handlers
function setupExportAndSync() {
    const btnExport = document.getElementById("btnExportJSON");
    if (btnExport) {
        btnExport.addEventListener("click", () => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(shopItemsList, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", "shop_items.json");
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
            showToast("📥 File shop_items.json berhasil diunduh!");
        });
    }

    const btnSync = document.getElementById("btnSyncFirebase");
    if (btnSync) {
        btnSync.addEventListener("click", () => {
            initFirebase();
        });
    }
}

// Toast Helper
function showToast(msg) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => {
        toast.classList.remove("show");
    }, 3500);
}

// Utility Functions
function formatRupiah(val) {
    return "Rp " + val.toLocaleString("id-ID");
}

function escapeHtml(str) {
    return str ? str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
}
