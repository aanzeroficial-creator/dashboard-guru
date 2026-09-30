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

function setupQuizEvents() {
    const searchInput = document.getElementById("searchQuizStudent");
    const classFilter = document.getElementById("filterQuizClass");
    const btnExport = document.getElementById("btnExportQuizCSV");

    if (searchInput) {
        searchInput.addEventListener("input", () => renderQuizResultsMonitor());
    }
    if (classFilter) {
        classFilter.addEventListener("change", () => renderQuizResultsMonitor());
    }
    if (btnExport) {
        btnExport.addEventListener("click", () => downloadQuizCSV());
    }
}

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

function updateClassDropdownFilter() {
    const select = document.getElementById("filterQuizClass");
    if (!select) return;
    const classes = new Set(["all"]);
    quizResultsList.forEach(q => { if (q.class) classes.add(q.class); });

    let html = `<option value="all">Semua Kelas</option>`;
    classes.forEach(c => {
        if (c !== "all") html += `<option value="${escapeHtml(c)}">Kelas ${escapeHtml(c)}</option>`;
    });
    select.innerHTML = html;
}

function renderQuizResultsMonitor() {
    const masterList = document.getElementById("studentMasterList");
    const detailView = document.getElementById("studentDetailView");
    const statTotal = document.getElementById("statTotalQuiz");
    const statAvg = document.getElementById("statAvgScore");
    const statPerfect = document.getElementById("statPerfectCount");
    const countBadge = document.getElementById("studentCountBadge");
    const searchVal = (document.getElementById("searchQuizStudent")?.value || "").toLowerCase().trim();
    const classVal = document.getElementById("filterQuizClass")?.value || "all";

    if (!masterList || !detailView) return;

    let filtered = quizResultsList;
    if (classVal !== "all") {
        filtered = filtered.filter(q => q.class === classVal);
    }
    if (searchVal !== "") {
        filtered = filtered.filter(q => q.name.toLowerCase().includes(searchVal) || q.class.toLowerCase().includes(searchVal) || q.title.toLowerCase().includes(searchVal));
    }

    if (statTotal) statTotal.textContent = quizResultsList.length;
    if (statAvg) {
        const totalSum = quizResultsList.reduce((acc, curr) => acc + curr.score, 0);
        const avg = quizResultsList.length > 0 ? Math.round(totalSum / quizResultsList.length) : 0;
        statAvg.textContent = avg;
    }
    if (statPerfect) {
        const perfects = quizResultsList.filter(q => q.score >= 95).length;
        statPerfect.textContent = perfects;
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

    if (students.length === 0) {
        masterList.innerHTML = `<div class="empty-state-banner"><p>Belum ada data siswa.</p></div>`;
        detailView.innerHTML = `<div class="empty-state-banner"><p>Belum ada data nilai kuis siswa yang tersimpan.</p></div>`;
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
        const latestQuiz = s.quizzes[s.quizzes.length - 1] || s.quizzes[0];
        const lastScore = latestQuiz ? latestQuiz.score : 0;

        let scoreBadgeColor = "#10B981";
        if (lastScore < 50) scoreBadgeColor = "#EF4444";
        else if (lastScore < 80) scoreBadgeColor = "#F59E0B";

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
                <div style="background: ${scoreBadgeColor}22; color: ${scoreBadgeColor}; font-size: 12px; font-weight: 800; padding: 4px 8px; border-radius: 8px;">
                    ${lastScore}
                </div>
            </div>
        `;
    });

    masterList.innerHTML = masterHtml;

    // Render Selected Student's Detail View (Right Column)
    renderStudentDetailView(studentMap.get(selectedStudentKey));
}

window.selectStudentForQuiz = function(sKey) {
    selectedStudentKey = sKey;
    renderQuizResultsMonitor();
};

function renderStudentDetailView(studentObj) {
    const detailView = document.getElementById("studentDetailView");
    if (!detailView || !studentObj) return;

    const avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(studentObj.name)}`;
    const totalQuizzes = studentObj.quizzes.length;
    const avgScore = Math.round(studentObj.quizzes.reduce((acc, q) => acc + q.score, 0) / totalQuizzes);

    let detailHtml = `
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 14px;">
            <div style="display: flex; align-items: center; gap: 12px;">
                <img src="${avatar}" style="width: 52px; height: 52px; border-radius: 50%; background: #edf2f7; border: 2px solid #8B5CF6;">
                <div>
                    <h4 style="margin: 0; font-size: 16px; font-weight: 800; color: #1e293b;">${escapeHtml(studentObj.name)}</h4>
                    <p style="margin: 2px 0 0 0; font-size: 12px; color: #64748b; font-weight: 600;">Kelas ${escapeHtml(studentObj.class)} • Status: Telah Mengerjakan Ujian Kuis</p>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="background: #F3E8FF; border: 1px solid #DDD6FE; padding: 6px 12px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 10px; color: #6D28D9; font-weight: 700;">RATA-RATA</div>
                    <div style="font-size: 16px; font-weight: 800; color: #7C3AED;">${avgScore}</div>
                </div>
                <div style="background: #ECFDF5; border: 1px solid #A7F3D0; padding: 6px 12px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 10px; color: #047857; font-weight: 700;">TOTAL KUIS</div>
                    <div style="font-size: 16px; font-weight: 800; color: #059669;">${totalQuizzes}</div>
                </div>
                <button onclick="deleteStudentAllResults('${escapeHtml(studentObj.name)}', '${escapeHtml(studentObj.class)}')" 
                        style="background: #FEF2F2; color: #EF4444; border: 1.5px solid #FCA5A5; border-radius: 8px; padding: 7px 10px; font-size: 11px; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s ease;">
                    🗑️ Hapus Semua Data Siswa Ini
                </button>
            </div>
        </div>

        <h5 style="margin: 0 0 10px 0; font-size: 13px; color: #475569; font-weight: 700;">📋 Riwayat & Hasil Kuis Siswa:</h5>
        <div style="display: flex; flex-direction: column; gap: 10px; overflow-y: auto; max-height: 320px;">
    `;

    studentObj.quizzes.forEach(q => {
        let badgeBg = "#10B981";
        let predikat = "Lulus Sempurna 🌟";
        let evalText = "Siswa sudah menguasai seluruh materi edukasi ekonomi ini dengan sangat baik!";

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

// Window Expose Delete Quiz Functions
window.deleteQuizResult = async function(id, name) {
    if (!confirm(`Apakah Anda yakin ingin menghapus 1 hasil kuis ini milik "${name}"?`)) return;
    try {
        if (isFirebaseOnline && id && !id.startsWith("local-")) {
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
            if (isFirebaseOnline && item.id && !item.id.startsWith("local-")) {
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
    if (quizResultsList.length === 0) {
        showToast("⚠️ Belum ada data nilai kuis untuk diunduh.");
        return;
    }
    let csvContent = "data:text/csv;charset=utf-8,Nama Siswa,Kelas,Kuis,Nilai,Waktu\n";
    quizResultsList.forEach(q => {
        csvContent += `"${q.name}","${q.class}","${q.title}",${q.score},"${q.time}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Rekap_Nilai_Kuis_Siswa_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast("📥 File Rekap Nilai Kuis CSV berhasil diunduh!");
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
