document.addEventListener('DOMContentLoaded', () => {
  const loadingEl = document.getElementById('global-loading');
  const contentArea = document.getElementById('contentArea');
  const btnLoad = document.getElementById('btn-load-data');
  const selGuru = document.getElementById('select-guru');
  const selMapel = document.getElementById('select-mapel');
  const selKelas = document.getElementById('select-kelas');
  const selJam = document.getElementById('select-jam');
  
  // Dummy Santri Data
  const dummySantri = [
    { id: 'S01', nama: 'Abdullah Azzam' },
    { id: 'S02', nama: 'Fulan bin Fulan' },
    { id: 'S03', nama: 'Hasan Al-Bashri' },
    { id: 'S04', nama: 'Umar Al-Faruq' },
    { id: 'S05', nama: 'Zaid bin Tsabit' },
    { id: 'S06', nama: 'Khalid bin Walid' },
    { id: 'S07', nama: 'Tariq bin Ziyad' },
    { id: 'S08', nama: 'Salahuddin Al-Ayyubi' }
  ];

  // Helper Loading
  function showLoading(show) {
    if(show) loadingEl.classList.remove('d-none');
    else loadingEl.classList.add('d-none');
  }

  // Helper Format Tanggal Indonesia: "Hari, DD Bulan YYYY" (Contoh: "Kamis, 20 Agustus 2026")
  function formatIndoDate(dateInput) {
    if (!dateInput && dateInput !== 0) return '-';
    var d;
    if (dateInput instanceof Date) {
      d = dateInput;
    } else {
      var str = String(dateInput).trim();
      if (!str || str === '-' || str === 'undefined' || str === 'null') return '-';
      var match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (match) {
        d = new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
      } else {
        d = new Date(str);
      }
    }
    if (isNaN(d.getTime())) return String(dateInput);
    var days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    var months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    return days[d.getDay()] + ', ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  // GAS API URL
  const GAS_URL = "https://script.google.com/macros/s/AKfycbxWjwlc6-mXpOimodZMFvQIC8hwdGRAz78PqnYIfQgSuXKkI9fUP4hXfC5x3QUIypiT/exec?action=get_jadwal_kbm";
  let allJadwal = [];
  let allMapel = [];
  let allSantri = [];
  let allStaff = [];
  let activeJadwalIds = [];
  let progressInterval = null;
  let jamMasukTime = null;
  
  // State for clock out context
  let activeClockIn = null;

  // Init Data from Server
  async function initData() {
    showLoading(true);
    selGuru.innerHTML = '<option value="" selected disabled>-- Memuat Data... --</option>';
    try {
      const response = await fetch(GAS_URL);
      const res = await response.json();
      if(res.success) {
        allJadwal = res.jadwal || [];
        allMapel = res.mapel || [];
        allSantri = res.santri || [];
        allStaff = res.staff || [];
        activeJadwalIds = res.active_jadwal || [];


        populateGuruDropdown(allStaff, allJadwal);
        renderDashboard(); // Render the dashboard after data is loaded
        
        // Simpan cache master data untuk pemulihan cepat
        try {
          localStorage.setItem('maisya_kbm_master_cache', JSON.stringify({
            allJadwal, allMapel, allSantri, allStaff, activeJadwalIds,
            savedAt: new Date().toISOString()
          }));
        } catch(e) {}

        // Restore active session if available
        restoreSessionState();
      } else {
        Swal.fire('Error', 'Gagal memuat data jadwal dari server.', 'error');
      }
    } catch (e) {
      console.error(e);
      // Coba pulihkan dari master cache lokal jika fetch gagal
      let loadedFromCache = false;
      try {
        const cached = localStorage.getItem('maisya_kbm_master_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.allJadwal && parsed.allJadwal.length > 0) {
            allJadwal = parsed.allJadwal || [];
            allMapel = parsed.allMapel || [];
            allSantri = parsed.allSantri || [];
            allStaff = parsed.allStaff || [];
            activeJadwalIds = parsed.activeJadwalIds || [];
            populateGuruDropdown(allStaff, allJadwal);
            renderDashboard();
            restoreSessionState();
            loadedFromCache = true;
          }
        }
      } catch(eCache) {}

      if (!loadedFromCache) {
        Swal.fire('Offline', 'Tidak dapat terhubung ke server (Offline Mode). Data jadwal tidak dapat dimuat.', 'warning');
        selGuru.innerHTML = '<option value="" selected disabled>-- Offline --</option>';
      }
    }
    showLoading(false);
  }

  // Tombol Sinkronisasi Data Cepat dari Core Portal
  const btnSyncData = document.getElementById('btn-sync-data');
  if (btnSyncData) {
    btnSyncData.addEventListener('click', async () => {
      var icon = btnSyncData.querySelector('i');
      if (icon) icon.classList.add('bi-spin');
      showLoading(true);
      try {
        localStorage.removeItem('maisya_kbm_master_cache');
        await initData();
        Swal.fire({
          icon: 'success',
          title: 'Sinkronisasi Berhasil',
          text: 'Data santri, jadwal, dan guru telah diperbarui langsung dari Core Portal.',
          timer: 2000,
          showConfirmButton: false
        });
      } catch(e) {
        Swal.fire('Gagal', 'Sinkronisasi gagal: ' + e.message, 'error');
      } finally {
        if (icon) icon.classList.remove('bi-spin');
        showLoading(false);
      }
    });
  }

  function populateGuruDropdown(staffList, jadwals) {
    selGuru.innerHTML = '<option value="" selected disabled>-- Pilih Guru --</option>';
    
    // Get unique staff IDs that exist in jadwal to only show teachers who have schedules
    const guruWithJadwal = [...new Set(jadwals.map(j => j.ID_Staff))];
    
    // Map to objects so we can sort alphabetically
    const guruData = guruWithJadwal.map(idStaff => {
      const st = (staffList || []).find(s => s.ID_Staff === idStaff);
      let nama = st ? st.Nama_Lengkap : (jadwals.find(j => j.ID_Staff === idStaff).Nama_Guru || idStaff);
      
      // Ensure nama is a string and trim it to avoid sorting issues with spaces
      nama = String(nama || '').trim();
      if (!nama) nama = String(idStaff).trim();

      return { idStaff, nama };
    });

    // Sort alphabetically by name (case-insensitive)
    guruData.sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' }));

    // Append sorted options to select
    guruData.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.idStaff;
      opt.innerText = item.nama;
      selGuru.appendChild(opt);
    });
  }

  // Helper function to format time correctly from sheet dates
  function formatTime(timeStr) {
    if(!timeStr) return "";
    if(String(timeStr).includes("1899-12-30") || String(timeStr).includes("T")) {
      try {
        const d = new Date(timeStr);
        return String(d.getHours()).padStart(2, '0') + ":" + String(d.getMinutes()).padStart(2, '0');
      } catch(e) {}
    }
    // If it's something like "11.00"
    return String(timeStr).replace(".", ":").substring(0,5);
  }

  // Dashboard Rendering
  function renderDashboard() {
    const tbody = document.getElementById('body-jadwal-dashboard');
    if (!tbody) return;

    if (allJadwal.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-muted">Jadwal tidak tersedia</td></tr>';
      return;
    }

    // Populate filter dropdowns
    const uniqueKelas = [...new Set(allJadwal.map(j => j.Kelas))].filter(Boolean).sort((a, b) => {
      const numA = parseInt(String(a).match(/\d+/)?.[0] || 0);
      const numB = parseInt(String(b).match(/\d+/)?.[0] || 0);
      return numA - numB;
    });
    
    const filterKelas = document.getElementById('filter-kelas');
    if (filterKelas) {
      filterKelas.innerHTML = '<option value="Semua Kelas">Semua Kelas</option>';
      uniqueKelas.forEach(k => {
        filterKelas.innerHTML += `<option value="${k}">${k}</option>`;
      });
    }

    // Populate filter guru dropdown
    const filterGuru = document.getElementById('filter-guru');
    if (filterGuru) {
      filterGuru.innerHTML = '<option value="Semua Guru">Semua Guru</option>';
      const guruWithJadwal = [...new Set(allJadwal.map(j => j.ID_Staff))].filter(Boolean);
      const guruData = guruWithJadwal.map(idStaff => {
        const st = (allStaff || []).find(s => s.ID_Staff === idStaff);
        let nama = st ? st.Nama_Lengkap : (allJadwal.find(j => j.ID_Staff === idStaff)?.Nama_Guru || idStaff);
        nama = String(nama || '').trim();
        if (!nama) nama = String(idStaff).trim();
        return { idStaff, nama };
      });
      guruData.sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' }));
      guruData.forEach(g => {
        filterGuru.innerHTML += `<option value="${g.idStaff}">${g.nama}</option>`;
      });
    }

    const filterHari = document.getElementById('filter-hari');
    const filterJam = document.getElementById('filter-jam');
    
    // Set default hari to today
    if(filterHari) {
      const days = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      const today = days[new Date().getDay()];
      for (let i = 0; i < filterHari.options.length; i++) {
        if (filterHari.options[i].value.toLowerCase() === today.toLowerCase()) {
          filterHari.value = filterHari.options[i].value;
          break;
        }
      }
    }
    
    if(filterHari) filterHari.addEventListener('change', drawDashboardTable);
    if(filterJam) filterJam.addEventListener('change', drawDashboardTable);
    if(filterKelas) filterKelas.addEventListener('change', drawDashboardTable);
    if(filterGuru) filterGuru.addEventListener('change', drawDashboardTable);

    // Initial draw
    drawDashboardTable();
  }

  function drawDashboardTable() {
    const tbody = document.getElementById('body-jadwal-dashboard');
    if (!tbody) return;

    const filterHariVal = document.getElementById('filter-hari') ? document.getElementById('filter-hari').value : 'Semua Hari';
    const filterJamVal = document.getElementById('filter-jam') ? document.getElementById('filter-jam').value : 'Semua Jam';
    const filterKelasVal = document.getElementById('filter-kelas') ? document.getElementById('filter-kelas').value : 'Semua Kelas';
    const filterGuruVal = document.getElementById('filter-guru') ? document.getElementById('filter-guru').value : 'Semua Guru';

    let filtered = allJadwal;

    if (filterHariVal !== 'Semua Hari') {
      filtered = filtered.filter(j => String(j.Hari).toLowerCase() === String(filterHariVal).toLowerCase());
    }
    
    if (filterKelasVal !== 'Semua Kelas') {
      filtered = filtered.filter(j => String(j.Kelas) === String(filterKelasVal));
    }

    if (filterGuruVal !== 'Semua Guru') {
      filtered = filtered.filter(j => String(j.ID_Staff) === String(filterGuruVal));
    }

    // For jam filtering, we use simple text matching on the "Jam Ke-" field if available
    if (filterJamVal !== 'Semua Jam') {
       // Pagi (1-4), Siang (5-6), Malam
       filtered = filtered.filter(j => {
         const jamStr = String(j.Jam_Mengajar || j.Jam || '').toLowerCase();
         if (filterJamVal === 'Pagi') {
            return jamStr.includes('1') || jamStr.includes('2') || jamStr.includes('3') || jamStr.includes('4') || jamStr.includes('pagi');
         } else if (filterJamVal === 'Siang') {
            return jamStr.includes('5') || jamStr.includes('6') || jamStr.includes('7') || jamStr.includes('8') || jamStr.includes('siang');
         } else if (filterJamVal === 'Malam') {
            return jamStr.includes('malam') || jamStr.includes('ekstra');
         }
         return true;
       });
    }

    tbody.innerHTML = '';
    
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-muted">Tidak ada jadwal yang cocok dengan filter.</td></tr>';
      return;
    }

    // Sort jadwal by class number
    filtered.sort((a, b) => {
      const numA = parseInt(String(a.Kelas).match(/\d+/)?.[0] || 0);
      const numB = parseInt(String(b.Kelas).match(/\d+/)?.[0] || 0);
      return numA - numB;
    });

    filtered.forEach(j => {
      let jamText = "";
      if (j.Jam_Mulai && j.Jam_Selesai) {
        jamText = `${formatTime(j.Jam_Mulai)} - ${formatTime(j.Jam_Selesai)}`;
      } else {
        jamText = j.Jam_Mengajar || j.Jam || (j.Jam_Mulai + ' - ' + j.Jam_Selesai);
      }
      
      const st = (allStaff || []).find(s => s.ID_Staff === j.ID_Staff);
      let namaGuru = st ? st.Nama_Lengkap : (j.Nama_Guru || j.ID_Staff);
      
      const mapelObj = allMapel.find(m => m.ID_Mapel === j.ID_Mapel);
      const namaMapel = mapelObj ? mapelObj.Nama_Mapel : j.ID_Mapel;
      
      // We pass the required data in data- attributes so click can handle it
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="py-3 px-4">${j.Hari || '-'}</td>
        <td class="py-3 px-4"><span class="badge bg-light text-secondary border border-secondary-subtle">${jamText}</span></td>
        <td class="py-3 px-4 fw-medium text-primary">${j.Kelas || '-'}</td>
        <td class="py-3 px-4">${namaMapel || '-'}</td>
        <td class="py-3 px-4 text-muted">${namaGuru || '-'}</td>
      `;
      
      tr.addEventListener('click', () => {
         selectJadwalFromDashboard(j.ID_Staff, j.ID_Mapel, j.Kelas, jamText);
      });
      
      tbody.appendChild(tr);
    });
  }

  function selectJadwalFromDashboard(idGuru, idMapel, kelas, jamText) {
     // Hide dashboard, show config
     document.getElementById('dashboard-section').classList.add('d-none');
     document.getElementById('config-section').classList.remove('d-none');
     if(document.getElementById('welcome-header')) document.getElementById('welcome-header').classList.add('d-none');
     if(document.getElementById('main-nav-container')) document.getElementById('main-nav-container').classList.add('d-none');
     
     // Set dropdowns manually and trigger cascades
     selGuru.value = idGuru;
     updateMapel(); // this populates Mapel based on Guru
     
     setTimeout(() => {
       selMapel.value = idMapel;
       updateKelas(); // this populates Kelas based on Mapel
       
       setTimeout(() => {
         selKelas.value = kelas;
         updateJam(); // this populates Jam
         
         setTimeout(() => {
           // Some jam options might have day prefix
           // So we select by matching text
           for (let i = 0; i < selJam.options.length; i++) {
             if (selJam.options[i].value.includes(jamText)) {
               selJam.selectedIndex = i;
               break;
             }
           }
           
           if (selJam.value) {
             btnLoad.disabled = false;
             // Don't auto-start progress bar here to let them see the config first
           }
         }, 50);
       }, 50);
     }, 50);
  }

  // --- Log Presensi Logic ---
  const navJadwal = document.getElementById('nav-jadwal');
  const navLog = document.getElementById('nav-log');
  const dashboardSection = document.getElementById('dashboard-section');
  const logSection = document.getElementById('log-section');
  const configSection = document.getElementById('config-section');
  
  const filterPeriodeLog = document.getElementById('filter-periode-log');
  const wrapperSingleDate = document.getElementById('wrapper-single-date');
  const wrapperRangeTanggal = document.getElementById('wrapper-range-tanggal');
  const filterStartDateLog = document.getElementById('filter-start-date-log');
  const filterEndDateLog = document.getElementById('filter-end-date-log');
  const btnApplyRangeLog = document.getElementById('btn-apply-range-log');
  const filterTanggalLog = document.getElementById('filter-tanggal-log');
  const filterKelasLog = document.getElementById('filter-kelas-log');
  const filterStatusLog = document.getElementById('filter-status-log');
  const filterSearchLog = document.getElementById('filter-search-log');
  const btnRefreshLog = document.getElementById('btn-refresh-log');
  const btnPrintLog = document.getElementById('btn-print-log');
  const tbodyLog = document.getElementById('body-log');

  // --- Navigasi Tab Baru ---
  const navRekapAbsen = document.getElementById('nav-rekap-absen');
  const navCatatanKasus = document.getElementById('nav-catatan-kasus');
  const rekapAbsenSection = document.getElementById('rekap-absen-section');
  const catatanKasusSection = document.getElementById('catatan-kasus-section');

  // --- Filter & Kontrol Tab Rekap Ketidakhadiran ---
  const filterPeriodeRekap = document.getElementById('filter-periode-rekap');
  const wrapperSingleDateRekap = document.getElementById('wrapper-single-date-rekap');
  const wrapperRangeTanggalRekap = document.getElementById('wrapper-range-tanggal-rekap');
  const filterTanggalRekap = document.getElementById('filter-tanggal-rekap');
  const filterStartDateRekap = document.getElementById('filter-start-date-rekap');
  const filterEndDateRekap = document.getElementById('filter-end-date-rekap');
  const btnApplyRangeRekap = document.getElementById('btn-apply-range-rekap');
  const filterKelasRekap = document.getElementById('filter-kelas-rekap');
  const filterSortRekap = document.getElementById('filter-sort-rekap');
  const checkKategoriIzin = document.getElementById('check-kategori-izin');
  const checkKategoriSakit = document.getElementById('check-kategori-sakit');
  const checkKategoriAlfa = document.getElementById('check-kategori-alfa');
  const filterSearchRekap = document.getElementById('filter-search-rekap');
  const btnRefreshRekap = document.getElementById('btn-refresh-rekap');
  const btnPrintRekap = document.getElementById('btn-print-rekap');
  const tbodyRekapAbsen = document.getElementById('body-rekap-absen');

  // --- Filter & Kontrol Tab Catatan Permasalahan ---
  const filterModeWaktuKasus = document.getElementById('filter-mode-waktu-kasus');
  const wrapperKasusBulan = document.getElementById('wrapper-kasus-bulan');
  const wrapperKasusPekan = document.getElementById('wrapper-kasus-pekan');
  const wrapperKasusRentang = document.getElementById('wrapper-kasus-rentang');
  const filterPilihanBulanKasus = document.getElementById('filter-pilihan-bulan-kasus');
  const wrapperSpecificMonth = document.getElementById('wrapper-specific-month');
  const filterKasusMonthSelect = document.getElementById('filter-kasus-month-select');
  const filterKasusYearSelect = document.getElementById('filter-kasus-year-select');
  const filterPilihanPekanKasus = document.getElementById('filter-pilihan-pekan-kasus');
  const filterStartDateKasus = document.getElementById('filter-start-date-kasus');
  const filterEndDateKasus = document.getElementById('filter-end-date-kasus');
  const btnApplyRangeKasus = document.getElementById('btn-apply-range-kasus');
  const kasusQuickKelasPills = document.getElementById('kasus-quick-kelas-pills');
  const filterTipeKasus = document.getElementById('filter-tipe-kasus');
  const filterSearchKasus = document.getElementById('filter-search-kasus');
  const btnRefreshKasus = document.getElementById('btn-refresh-kasus');
  const btnPrintKasus = document.getElementById('btn-print-kasus');
  const btnViewFeed = document.getElementById('btn-view-feed');
  const btnViewTable = document.getElementById('btn-view-table');
  const containerKasusFeed = document.getElementById('container-kasus-feed');
  const containerKasusTable = document.getElementById('container-kasus-table');
  const feedKasusList = document.getElementById('feed-kasus-list');
  const tbodyKasusTable = document.getElementById('body-kasus-table');

  let currentRawLogData = [];
  let currentRekapProcessedData = [];
  let currentSortRekap = { col: 'total', dir: 'desc' };
  window.rekapSantriRecordsCache = {};

  let currentKasusProcessedData = [];
  let currentSelectedKelasKasus = 'Semua';
  let currentKasusViewMode = 'feed';

  // Set default date to today on load
  const todayDateStr = new Date().toISOString().split('T')[0];
  if (filterTanggalLog) filterTanggalLog.value = todayDateStr;
  if (filterStartDateLog) filterStartDateLog.value = todayDateStr;
  if (filterEndDateLog) filterEndDateLog.value = todayDateStr;

  if (filterTanggalRekap) filterTanggalRekap.value = todayDateStr;
  if (filterStartDateRekap) filterStartDateRekap.value = todayDateStr;
  if (filterEndDateRekap) filterEndDateRekap.value = todayDateStr;

  if (filterStartDateKasus) filterStartDateKasus.value = todayDateStr;
  if (filterEndDateKasus) filterEndDateKasus.value = todayDateStr;
  if (filterKasusMonthSelect) filterKasusMonthSelect.value = String(new Date().getMonth() + 1);
  if (filterKasusYearSelect) filterKasusYearSelect.value = String(new Date().getFullYear());

  function formatDateIndo(dateStr) {
    if (!dateStr) return '-';
    try {
      const parts = String(dateStr).split('T')[0].split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    } catch (e) {}
    return dateStr;
  }

  function getLogDateRange() {
    const periode = filterPeriodeLog ? filterPeriodeLog.value : 'today';
    const now = new Date();
    const fmt = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    if (periode === 'today') {
      const tgl = filterTanggalLog && filterTanggalLog.value ? filterTanggalLog.value : fmt(now);
      return { startDate: tgl, endDate: tgl, label: 'Hari Ini (' + formatDateIndo(tgl) + ')' };
    }
    if (periode === 'this_week') {
      const day = now.getDay(); // 0 is Ahad
      const diffToMonday = (day === 0 ? 6 : day - 1);
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { startDate: fmt(monday), endDate: fmt(sunday), label: `Pekan Ini (${formatDateIndo(fmt(monday))} - ${formatDateIndo(fmt(sunday))})` };
    }
    if (periode === 'last_week') {
      const day = now.getDay();
      const diffToLastMonday = (day === 0 ? 6 : day - 1) + 7;
      const lastMonday = new Date(now);
      lastMonday.setDate(now.getDate() - diffToLastMonday);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      return { startDate: fmt(lastMonday), endDate: fmt(lastSunday), label: `Pekan Lalu (${formatDateIndo(fmt(lastMonday))} - ${formatDateIndo(fmt(lastSunday))})` };
    }
    if (periode === 'this_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { startDate: fmt(firstDay), endDate: fmt(lastDay), label: `Bulan Ini (${formatDateIndo(fmt(firstDay))} - ${formatDateIndo(fmt(lastDay))})` };
    }
    if (periode === 'last_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startDate: fmt(firstDay), endDate: fmt(lastDay), label: `Bulan Lalu (${formatDateIndo(fmt(firstDay))} - ${formatDateIndo(fmt(lastDay))})` };
    }
    if (periode === 'custom') {
      const start = filterStartDateLog && filterStartDateLog.value ? filterStartDateLog.value : fmt(now);
      const end = filterEndDateLog && filterEndDateLog.value ? filterEndDateLog.value : fmt(now);
      return { startDate: start, endDate: end, label: `${formatDateIndo(start)} s/d ${formatDateIndo(end)}` };
    }
    return { startDate: fmt(now), endDate: fmt(now), label: formatDateIndo(fmt(now)) };
  }

  function hideAllMainSections() {
    if (dashboardSection) dashboardSection.classList.add('d-none');
    if (logSection) logSection.classList.add('d-none');
    if (rekapAbsenSection) rekapAbsenSection.classList.add('d-none');
    if (catatanKasusSection) catatanKasusSection.classList.add('d-none');
    if (configSection) configSection.classList.add('d-none');
  }

  if (navJadwal) {
    navJadwal.addEventListener('change', () => {
      if (navJadwal.checked) {
        hideAllMainSections();
        dashboardSection.classList.remove('d-none');
      }
    });
  }

  if (navLog) {
    navLog.addEventListener('change', () => {
      if (navLog.checked) {
        hideAllMainSections();
        logSection.classList.remove('d-none');
        if (!filterTanggalLog.value) {
          filterTanggalLog.value = todayDateStr;
        }
        fetchLogKbm();
      }
    });
  }

  if (navRekapAbsen) {
    navRekapAbsen.addEventListener('change', () => {
      if (navRekapAbsen.checked) {
        hideAllMainSections();
        rekapAbsenSection.classList.remove('d-none');
        fetchRekapAbsen();
      }
    });
  }

  if (navCatatanKasus) {
    navCatatanKasus.addEventListener('change', () => {
      if (navCatatanKasus.checked) {
        hideAllMainSections();
        catatanKasusSection.classList.remove('d-none');
        fetchCatatanKasus();
      }
    });
  }

  const btnKembaliJadwal = document.getElementById('btn-kembali-jadwal');
  if (btnKembaliJadwal) {
    btnKembaliJadwal.addEventListener('click', () => {
      hideAllMainSections();
      dashboardSection.classList.remove('d-none');
      if (navJadwal) navJadwal.checked = true;
    });
  }

  if (filterPeriodeLog) {
    filterPeriodeLog.addEventListener('change', () => {
      const val = filterPeriodeLog.value;
      if (val === 'today') {
        if (wrapperSingleDate) wrapperSingleDate.classList.remove('d-none');
        if (wrapperRangeTanggal) wrapperRangeTanggal.classList.add('d-none');
      } else if (val === 'custom') {
        if (wrapperSingleDate) wrapperSingleDate.classList.add('d-none');
        if (wrapperRangeTanggal) wrapperRangeTanggal.classList.remove('d-none');
        const now = new Date();
        const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!filterStartDateLog.value) {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(now.getDate() - 7);
          filterStartDateLog.value = fmt(sevenDaysAgo);
        }
        if (!filterEndDateLog.value) {
          filterEndDateLog.value = fmt(now);
        }
      } else {
        if (wrapperSingleDate) wrapperSingleDate.classList.add('d-none');
        if (wrapperRangeTanggal) wrapperRangeTanggal.classList.add('d-none');
      }
      fetchLogKbm();
    });
  }

  if (filterTanggalLog) filterTanggalLog.addEventListener('change', fetchLogKbm);
  if (btnApplyRangeLog) btnApplyRangeLog.addEventListener('click', fetchLogKbm);
  if (filterStartDateLog) filterStartDateLog.addEventListener('change', () => {
    if (filterPeriodeLog && filterPeriodeLog.value === 'custom') fetchLogKbm();
  });
  if (filterEndDateLog) filterEndDateLog.addEventListener('change', () => {
    if (filterPeriodeLog && filterPeriodeLog.value === 'custom') fetchLogKbm();
  });

  if (filterKelasLog) filterKelasLog.addEventListener('change', applyLogFilters);
  if (filterStatusLog) filterStatusLog.addEventListener('change', applyLogFilters);
  if (filterSearchLog) filterSearchLog.addEventListener('input', applyLogFilters);
  if (btnRefreshLog) btnRefreshLog.addEventListener('click', fetchLogKbm);
  if (btnPrintLog) btnPrintLog.addEventListener('click', () => printLogTable());

  async function fetchLogKbm() {
    const range = getLogDateRange();
    
    tbodyLog.innerHTML = `<tr><td colspan="11" class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div> Memuat log presensi (${range.label})...</td></tr>`;
    showLoading(true);

    try {
      const payload = { 
        action: 'get_log_kbm', 
        startDate: range.startDate, 
        endDate: range.endDate,
        tanggal: range.startDate 
      };
      
      const response = await fetch("https://script.google.com/macros/s/AKfycbxWjwlc6-mXpOimodZMFvQIC8hwdGRAz78PqnYIfQgSuXKkI9fUP4hXfC5x3QUIypiT/exec?action=get_log_kbm", {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const res = await response.json();
      
      if(res.success) {
        currentRawLogData = res.data || [];
        populateKelasFilterLog(currentRawLogData);
        applyLogFilters();
      } else {
        Swal.fire('Error', res.message || 'Gagal memuat log.', 'error');
        tbodyLog.innerHTML = `<tr><td colspan="11" class="text-center py-5 text-danger">Gagal memuat log presensi.</td></tr>`;
      }
    } catch(e) {
       console.error(e);
       Swal.fire('Error', 'Terjadi kesalahan jaringan.', 'error');
       tbodyLog.innerHTML = `<tr><td colspan="11" class="text-center py-5 text-danger">Terjadi kesalahan jaringan.</td></tr>`;
    } finally {
       showLoading(false);
    }
  }

  function populateKelasFilterLog(data) {
    if (!filterKelasLog) return;
    const currentVal = filterKelasLog.value;
    const classes = [...new Set(data.map(d => d.kelas).filter(Boolean))].sort();
    filterKelasLog.innerHTML = '<option value="Semua">Semua Kelas</option>';
    classes.forEach(c => {
      filterKelasLog.innerHTML += `<option value="${c}">${c}</option>`;
    });
    if (classes.includes(currentVal)) {
      filterKelasLog.value = currentVal;
    }
  }

  function applyLogFilters() {
    let filtered = currentRawLogData;
    const kelasVal = filterKelasLog ? filterKelasLog.value : 'Semua';
    const statusVal = filterStatusLog ? filterStatusLog.value : 'Semua';
    const searchVal = filterSearchLog ? filterSearchLog.value.toLowerCase().trim() : '';

    if (kelasVal !== 'Semua') {
      filtered = filtered.filter(d => String(d.kelas) === String(kelasVal));
    }
    if (statusVal === 'Sudah Isi') {
      filtered = filtered.filter(d => d.status_isi === true || d.status_guru === 'Hadir');
    } else if (statusVal === 'Belum Isi') {
      filtered = filtered.filter(d => d.status_isi !== true && d.status_guru !== 'Hadir');
    }
    if (searchVal) {
      filtered = filtered.filter(d => 
        (d.guru && d.guru.toLowerCase().includes(searchVal)) ||
        (d.pelajaran && d.pelajaran.toLowerCase().includes(searchVal)) ||
        (d.kelas && d.kelas.toLowerCase().includes(searchVal)) ||
        (d.materi && d.materi.toLowerCase().includes(searchVal)) ||
        (d.tanggal && d.tanggal.includes(searchVal)) ||
        (d.hari && d.hari.toLowerCase().includes(searchVal))
      );
    }

    // Update Summary Statistics
    updateLogStats(currentRawLogData);
    renderLogTable(filtered);
  }

  function updateLogStats(data) {
    const totalJadwal = data.length;
    const terlaksana = data.filter(d => d.status_isi === true || d.status_guru === 'Hadir').length;
    const belum = totalJadwal - terlaksana;

    let totalSantriHadir = 0;
    let totalSantriAll = 0;
    data.forEach(d => {
      if (d.status_isi) {
        const h = parseInt(d.hadir) || 0;
        const i = parseInt(d.izin) || 0;
        const s = parseInt(d.sakit) || 0;
        const a = parseInt(d.alfa) || 0;
        totalSantriHadir += h;
        totalSantriAll += (h + i + s + a);
      }
    });
    const persenHadir = totalSantriAll > 0 ? Math.round((totalSantriHadir / totalSantriAll) * 100) : 0;

    const elTotal = document.getElementById('stat-total-jadwal');
    const elTerlaksana = document.getElementById('stat-terlaksana');
    const elBelum = document.getElementById('stat-belum-terisi');
    const elPersen = document.getElementById('stat-persen-hadir');

    if (elTotal) elTotal.innerText = totalJadwal;
    if (elTerlaksana) elTerlaksana.innerText = terlaksana;
    if (elBelum) elBelum.innerText = belum;
    if (elPersen) elPersen.innerText = persenHadir + '%';
  }

  function renderLogTable(data) {
    if (!data || data.length === 0) {
      tbodyLog.innerHTML = `<tr><td colspan="11" class="text-center py-5 text-muted"><div class="text-center mb-3"><i class="bi bi-calendar2-x display-4 text-light"></i></div>Tidak ada log KBM yang cocok dengan filter.</td></tr>`;
      return;
    }

    tbodyLog.innerHTML = '';
    data.forEach((item, index) => {
      window.santriDetailsCache = window.santriDetailsCache || {};
      if (item.status_isi && item.catatan_santri) {
         window.santriDetailsCache[item.id_jurnal] = item.catatan_santri;
      }

      let badgeMasuk = '';
      if (item.status_isi || item.status_guru === 'Hadir') {
         if (item.late_mins > 0) {
            badgeMasuk = `<div class="mt-1"><span class="badge bg-danger rounded-pill" style="font-size: 0.7rem;">Terlambat ${item.late_mins} mnt</span></div>`;
         } else if (item.waktu && item.waktu !== '-') {
            badgeMasuk = `<div class="mt-1"><span class="badge bg-success rounded-pill" style="font-size: 0.7rem;">Tepat waktu</span></div>`;
         }
      }

      let badgeKeluar = '';
      if (item.status_isi || item.status_guru === 'Hadir') {
         if (item.jam_ke && item.jam_ke !== '-') {
            if (item.over_mins > 0) {
               badgeKeluar = `<div class="mt-1"><span class="badge bg-warning text-dark rounded-pill" style="font-size: 0.7rem;">Lebih ${item.over_mins} mnt</span></div>`;
            }
         } else if (item.status_isi) {
            badgeKeluar = `<div class="mt-1"><span class="badge bg-danger rounded-pill" style="font-size: 0.7rem;">Tidak mengisi</span></div>`;
         }
      }
      
      let statusHtml = '';
      if (item.status_isi) {
          statusHtml = `<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>Hadir</span>`;
      } else if (item.status_guru === 'Hadir') {
          statusHtml = `<span class="badge bg-success bg-opacity-75 text-white" title="Guru telah hadir (Clock-in)"><i class="bi bi-check2-circle me-1"></i>Hadir (Clock-In)</span>`;
      } else if (item.status_guru === 'Izin') {
          statusHtml = `<span class="badge bg-info text-dark"><i class="bi bi-info-circle me-1"></i>Izin</span>`;
      } else if (item.status_guru === 'Sakit') {
          statusHtml = `<span class="badge bg-warning text-dark"><i class="bi bi-heart-pulse me-1"></i>Sakit</span>`;
      } else {
          statusHtml = `<span class="badge bg-secondary text-light"><i class="bi bi-dash-circle me-1"></i>Belum mengisi</span>`;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="fw-medium">${item.no}</td>
        <td class="text-nowrap">
           <div class="fw-semibold text-dark small">${item.hari || '-'}, ${formatDateIndo(item.tanggal)}</div>
        </td>
        <td>
           <span class="badge bg-light text-dark border"><i class="bi bi-clock me-1"></i>${item.waktu}</span>
           ${badgeMasuk}
        </td>
        <td class="text-nowrap">
           <span class="badge bg-light text-dark border"><i class="bi bi-clock me-1"></i>${item.jam_ke}</span>
           ${badgeKeluar}
        </td>
        <td><span class="badge bg-primary">${item.kelas}</span></td>
        <td class="fw-medium">${item.pelajaran}</td>
        <td>${item.guru}</td>
        <td>${statusHtml}</td>
        <td class="text-center">
           <span class="badge bg-success" style="cursor: pointer;" title="Hadir" onclick="showDetailSantriModal('${item.id_jurnal}', 'Hadir')">${item.hadir}</span> /
           <span class="badge bg-warning text-dark" style="cursor: pointer;" title="Izin" onclick="showDetailSantriModal('${item.id_jurnal}', 'Izin')">${item.izin}</span> /
           <span class="badge bg-info text-dark" style="cursor: pointer;" title="Sakit" onclick="showDetailSantriModal('${item.id_jurnal}', 'Sakit')">${item.sakit}</span> /
           <span class="badge bg-danger" style="cursor: pointer;" title="Alfa" onclick="showDetailSantriModal('${item.id_jurnal}', 'Alfa')">${item.alfa}</span>
        </td>
        <td>
           <div class="fw-medium small">${item.materi || '-'}</div>
           <div class="text-muted small fst-italic mt-1">${item.catatan_kelas || ''}</div>
        </td>
        <td>
           ${item.status_isi ? `<div class="d-flex gap-1 justify-content-center">
             <button class="btn btn-sm btn-outline-primary rounded-pill py-0 px-2 btn-edit-log" data-id="${item.id_jurnal}" title="Edit Log Presensi & Jurnal">
               <i class="bi bi-pencil"></i>
             </button>
             <button class="btn btn-sm btn-outline-danger rounded-pill py-0 px-2 btn-delete-log" data-id="${item.id_jurnal}" title="Hapus Log">
               <i class="bi bi-trash"></i>
             </button>
           </div>` : '-'}
        </td>
      `;
      tbodyLog.appendChild(tr);
    });

    // Bind edit buttons to open Modal Edit
    document.querySelectorAll('.btn-edit-log').forEach(btn => {
       btn.addEventListener('click', (e) => {
          const idJurnal = e.currentTarget.getAttribute('data-id');
          openEditLogModal(idJurnal);
       });
    });

    // Bind delete buttons
    document.querySelectorAll('.btn-delete-log').forEach(btn => {
       btn.addEventListener('click', (e) => {
          const idJurnal = e.currentTarget.getAttribute('data-id');
          confirmDeleteLog(idJurnal);
       });
    });
  }

  // Modal Rincian Santri (Hadir / Izin / Sakit / Alfa)
  window.showDetailSantriModal = function(idJurnal, selectedFilter) {
    if (!idJurnal) {
      Swal.fire('Info', 'Sesi KBM ini belum diisi oleh guru pengajar.', 'info');
      return;
    }

    const item = (currentRawLogData || []).find(d => d.id_jurnal === idJurnal || d.id_jadwal === idJurnal);
    if (!item || !item.status_isi) {
      Swal.fire('Info', 'Data kehadiran belum diisi pada sesi KBM ini.', 'info');
      return;
    }

    const rawSantriList = item.catatan_santri || (window.santriDetailsCache && window.santriDetailsCache[idJurnal]) || [];
    const santriMap = new Map();
    rawSantriList.forEach((s, idx) => {
      const sId = String(s.nis || s.id_santri || s.nama || `S_${idx}`).trim();
      if (!santriMap.has(sId)) {
        santriMap.set(sId, s);
      }
    });
    const santriList = Array.from(santriMap.values());
    if (santriList.length === 0) {
      Swal.fire('Info', 'Tidak ada data rincian santri untuk sesi ini.', 'info');
      return;
    }

    const modalTitle = document.getElementById('modal-detail-santri-title');
    const modalBody = document.getElementById('modal-detail-santri-body');
    if (!modalBody) return;

    let currentFilter = selectedFilter || 'Semua';

    function renderDetailContent() {
      const getBadge = (st) => {
        st = String(st || 'Hadir').toLowerCase();
        if (st.includes('hadir')) return '<span class="badge bg-success">Hadir</span>';
        if (st.includes('izin')) return '<span class="badge bg-warning text-dark">Izin</span>';
        if (st.includes('sakit')) return '<span class="badge bg-info text-dark">Sakit</span>';
        if (st.includes('alfa')) return '<span class="badge bg-danger">Alfa</span>';
        return `<span class="badge bg-secondary">${st}</span>`;
      };

      let filtered = santriList;
      if (currentFilter !== 'Semua') {
        filtered = santriList.filter(s => String(s.status || '').toLowerCase().includes(currentFilter.toLowerCase()));
      }

      if (modalTitle) {
        modalTitle.innerHTML = `<i class="bi bi-people-fill text-primary me-2"></i>Rincian Kehadiran Santri`;
      }

      let subHeaderHtml = `
        <div class="p-3 bg-light rounded-3 mb-3 border">
          <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2">
            <div>
              <div class="fw-bold text-dark fs-6">${item.pelajaran} - Kelas ${item.kelas}</div>
              <div class="text-muted small">Guru: <span class="fw-medium text-dark">${item.guru}</span> | Waktu: <span class="fw-medium text-dark">${item.waktu || '-'}</span> | <span class="text-primary fw-medium">${formatIndoDate(item.tanggal)}</span></div>
            </div>
            <div class="btn-group btn-group-sm flex-wrap shadow-sm rounded-pill p-1 bg-white border" role="group">
              <button type="button" class="btn btn-sm ${currentFilter === 'Semua' ? 'btn-primary' : 'btn-light'} rounded-pill px-2 py-0 fw-medium btn-filter-detail" data-filter="Semua">Semua (${santriList.length})</button>
              <button type="button" class="btn btn-sm ${currentFilter === 'Hadir' ? 'btn-success' : 'btn-light'} rounded-pill px-2 py-0 fw-medium btn-filter-detail" data-filter="Hadir">Hadir (${item.hadir || 0})</button>
              <button type="button" class="btn btn-sm ${currentFilter === 'Izin' ? 'btn-warning text-dark' : 'btn-light'} rounded-pill px-2 py-0 fw-medium btn-filter-detail" data-filter="Izin">Izin (${item.izin || 0})</button>
              <button type="button" class="btn btn-sm ${currentFilter === 'Sakit' ? 'btn-info text-dark' : 'btn-light'} rounded-pill px-2 py-0 fw-medium btn-filter-detail" data-filter="Sakit">Sakit (${item.sakit || 0})</button>
              <button type="button" class="btn btn-sm ${currentFilter === 'Alfa' ? 'btn-danger' : 'btn-light'} rounded-pill px-2 py-0 fw-medium btn-filter-detail" data-filter="Alfa">Alfa (${item.alfa || 0})</button>
            </div>
          </div>
        </div>
      `;

      let tableHtml = '';
      if (filtered.length === 0) {
        tableHtml = `
          <div class="text-center py-4 text-muted">
            <i class="bi bi-person-x display-6 text-secondary d-block mb-2"></i>
            Tidak ada santri dengan status <b>${currentFilter}</b> pada sesi ini.
          </div>
        `;
      } else {
        let rows = filtered.map((s, idx) => `
          <tr>
            <td class="text-muted small text-center" style="width: 40px;">${idx + 1}</td>
            <td class="fw-medium">${s.nama || s.nis || '-'}</td>
            <td class="text-center" style="width: 100px;">${getBadge(s.status)}</td>
            <td class="text-center fw-semibold text-primary" style="width: 80px;">${(s.nilai !== undefined && s.nilai !== null && s.nilai !== '') ? s.nilai : '-'}</td>
            <td class="text-muted small">${s.catatan || '-'}</td>
          </tr>
        `).join('');

        tableHtml = `
          <div class="table-responsive" style="max-height: 380px;">
            <table class="table table-sm table-hover align-middle mb-0">
              <thead class="table-light text-muted small position-sticky top-0">
                <tr>
                  <th class="text-center" style="width: 40px;">No</th>
                  <th>Nama Santri</th>
                  <th class="text-center" style="width: 100px;">Status</th>
                  <th class="text-center" style="width: 80px;">Nilai</th>
                  <th>Catatan</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        `;
      }

      modalBody.innerHTML = subHeaderHtml + tableHtml;

      modalBody.querySelectorAll('.btn-filter-detail').forEach(btn => {
        btn.addEventListener('click', (e) => {
          currentFilter = e.currentTarget.getAttribute('data-filter');
          renderDetailContent();
        });
      });
    }

    renderDetailContent();

    const modalEl = document.getElementById('modal-detail-santri');
    if (modalEl) {
      const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
      bsModal.show();
    }
  };

  function openEditLogModal(idJurnal) {
    const item = currentRawLogData.find(d => d.id_jurnal === idJurnal);
    if (!item) {
      Swal.fire('Error', 'Data log tidak ditemukan.', 'error');
      return;
    }

    document.getElementById('edit-log-id-jurnal').value = item.id_jurnal || '';
    document.getElementById('edit-log-id-jadwal').value = item.id_jadwal || '';
    document.getElementById('edit-log-id-mapel').value = item.id_mapel || '';
    document.getElementById('edit-log-kelas').value = item.kelas || '';
    document.getElementById('edit-log-tanggal').value = item.tanggal || filterTanggalLog.value;
    document.getElementById('edit-log-id-guru').value = item.id_guru || item.guru || '';
    document.getElementById('edit-log-materi').value = item.materi || '';
    document.getElementById('edit-log-catatan-kelas').value = item.catatan_kelas || '';
    const tglDisplay = formatIndoDate(item.tanggal || filterTanggalLog.value);
    document.getElementById('edit-log-subinfo').innerText = `Kelas ${item.kelas} - ${item.pelajaran} | Guru: ${item.guru} (${tglDisplay})`;

    // Helper format waktu ke HH:mm untuk input type="time"
    function cleanTimeForInput(val) {
      if (!val || val === '-') return '';
      const str = String(val).trim();
      const match = str.match(/(\d{1,2})[:.](\d{2})/);
      if (match) {
        const h = match[1].padStart(2, '0');
        const m = match[2];
        return `${h}:${m}`;
      }
      return '';
    }

    const jamMasukVal = cleanTimeForInput(item.waktu) || cleanTimeForInput(item.scheduled_masuk);
    const jamKeluarVal = cleanTimeForInput(item.jam_ke) || cleanTimeForInput(item.scheduled_keluar);
    
    const inpJamMasuk = document.getElementById('edit-log-jam-masuk');
    const inpJamKeluar = document.getElementById('edit-log-jam-keluar');
    if (inpJamMasuk) inpJamMasuk.value = jamMasukVal;
    if (inpJamKeluar) inpJamKeluar.value = jamKeluarVal;

    const tbody = document.getElementById('edit-log-tbody-santri');
    tbody.innerHTML = '';

    const rawSantriList = item.catatan_santri || [];
    const santriMap = new Map();
    rawSantriList.forEach((s, idx) => {
      const sId = String(s.nis || s.id_santri || s.nama || `S_${idx}`).trim();
      if (!santriMap.has(sId)) {
        santriMap.set(sId, s);
      }
    });
    const santriList = Array.from(santriMap.values());

    if (santriList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3 text-muted">Tidak ada rincian santri pada sesi ini.</td></tr>';
    } else {
      santriList.forEach((s, idx) => {
        const sId = s.nis || s.id_santri || `S_${idx}`;
        const st = String(s.status || 'Hadir').toLowerCase();
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="text-muted small">${idx + 1}</td>
          <td class="fw-medium">
            ${s.nama}
            <input type="hidden" class="edit-santri-id" value="${sId}">
            <input type="hidden" class="edit-santri-nama" value="${s.nama}">
          </td>
          <td class="text-center">
            <div class="attendance-radios">
              <input type="radio" name="edit_abs_${sId}" id="edit_hadir_${sId}" value="Hadir" ${st.includes('hadir') ? 'checked' : ''}>
              <label for="edit_hadir_${sId}">Hadir</label>
              
              <input type="radio" name="edit_abs_${sId}" id="edit_sakit_${sId}" value="Sakit" ${st.includes('sakit') ? 'checked' : ''}>
              <label for="edit_sakit_${sId}">Sakit</label>
              
              <input type="radio" name="edit_abs_${sId}" id="edit_izin_${sId}" value="Izin" ${st.includes('izin') ? 'checked' : ''}>
              <label for="edit_izin_${sId}">Izin</label>
              
              <input type="radio" name="edit_abs_${sId}" id="edit_alfa_${sId}" value="Alfa" ${st.includes('alfa') ? 'checked' : ''}>
              <label for="edit_alfa_${sId}">Alfa</label>
            </div>
          </td>
          <td>
            <input type="number" class="form-control form-control-sm text-center edit-santri-nilai" value="${s.nilai || ''}" placeholder="0-100" min="0" max="100">
          </td>
          <td>
            <input type="text" class="form-control form-control-sm edit-santri-catatan" value="${s.catatan || ''}" placeholder="Catatan...">
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    const editModal = new bootstrap.Modal(document.getElementById('modalEditLogKBM'));
    editModal.show();
  }

  // Handle Save Edit Log
  const btnSaveEditLog = document.getElementById('btn-save-edit-log');
  if (btnSaveEditLog) {
    btnSaveEditLog.addEventListener('click', async () => {
      const idJurnal = document.getElementById('edit-log-id-jurnal').value;
      const materi = document.getElementById('edit-log-materi').value.trim();
      const catatanKelas = document.getElementById('edit-log-catatan-kelas').value.trim();

      if (!materi) {
        Swal.fire('Perhatian', 'Materi Pokok / Bahasan Topik wajib diisi!', 'warning');
        return;
      }

      const rows = document.querySelectorAll('#edit-log-tbody-santri tr');
      const absensiList = [];
      rows.forEach(tr => {
        const idInp = tr.querySelector('.edit-santri-id');
        if (!idInp) return;
        const sId = idInp.value;
        const sNama = tr.querySelector('.edit-santri-nama') ? tr.querySelector('.edit-santri-nama').value : '';
        const radio = tr.querySelector(`input[name="edit_abs_${sId}"]:checked`);
        const nilaiInp = tr.querySelector('.edit-santri-nilai');
        const catatanInp = tr.querySelector('.edit-santri-catatan');

        absensiList.push({
          id_santri: sId,
          nis: sId,
          nama_santri: sNama,
          kehadiran: radio ? radio.value : 'Hadir',
          nilai: nilaiInp ? nilaiInp.value.trim() : '',
          catatan: catatanInp ? catatanInp.value.trim() : ''
        });
      });

      const jamMasuk = document.getElementById('edit-log-jam-masuk') ? document.getElementById('edit-log-jam-masuk').value.trim() : '';
      const jamKeluar = document.getElementById('edit-log-jam-keluar') ? document.getElementById('edit-log-jam-keluar').value.trim() : '';

      const payload = {
        action: 'update_log_kbm',
        id_jurnal: idJurnal,
        id_jadwal: document.getElementById('edit-log-id-jadwal').value,
        id_mapel: document.getElementById('edit-log-id-mapel').value,
        kelas: document.getElementById('edit-log-kelas').value,
        tanggal: document.getElementById('edit-log-tanggal').value,
        id_guru: document.getElementById('edit-log-id-guru').value,
        materi: materi,
        catatan: catatanKelas,
        jam_masuk: jamMasuk,
        jam_keluar: jamKeluar,
        absensi: absensiList
      };

      showLoading(true);
      try {
        const response = await fetch("https://script.google.com/macros/s/AKfycbxWjwlc6-mXpOimodZMFvQIC8hwdGRAz78PqnYIfQgSuXKkI9fUP4hXfC5x3QUIypiT/exec?action=update_log_kbm", {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });
        const res = await response.json();
        showLoading(false);
        if (res.success) {
          bootstrap.Modal.getInstance(document.getElementById('modalEditLogKBM')).hide();
          Swal.fire('Berhasil!', 'Log Presensi & Jurnal KBM berhasil diperbarui.', 'success');
          fetchLogKbm();
        } else {
          Swal.fire('Gagal', res.message || 'Terjadi kesalahan.', 'error');
        }
      } catch(err) {
        showLoading(false);
        Swal.fire('Error', 'Gagal mengirim pembaruan ke server.', 'error');
      }
    });
  }

  function printLogTable() {
    window.print();
  }

  // Tombol Kembali
  const btnKembali = document.getElementById('btn-kembali-jadwal');
  if (btnKembali) {
    btnKembali.addEventListener('click', () => {
      document.getElementById('config-section').classList.add('d-none');
      
      if(document.getElementById('welcome-header')) document.getElementById('welcome-header').classList.remove('d-none');
      if(document.getElementById('main-nav-container')) document.getElementById('main-nav-container').classList.remove('d-none');

      // Show whatever was active
      if(navLog && navLog.checked) {
         logSection.classList.remove('d-none');
      } else if(navRekapAbsen && navRekapAbsen.checked) {
         rekapAbsenSection.classList.remove('d-none');
      } else if(navCatatanKasus && navCatatanKasus.checked) {
         catatanKasusSection.classList.remove('d-none');
      } else {
         dashboardSection.classList.remove('d-none');
      }
      
      // Reset selections
      selGuru.value = "";
      selMapel.innerHTML = '<option value="" selected disabled>-- Mata Pelajaran --</option>';
      selMapel.disabled = true;
      selKelas.innerHTML = '<option value="" selected disabled>-- Kelas --</option>';
      selKelas.disabled = true;
      selJam.innerHTML = '<option value="" selected disabled>-- Jam Ke --</option>';
      selJam.disabled = true;
      btnLoad.disabled = true;
      document.getElementById('content-area').classList.add('d-none');
      
      const clockActions = document.getElementById('clock-actions');
      if (clockActions) clockActions.classList.add('d-none');
      
      const btnKeluar = document.getElementById('btn-jam-keluar');
      if (btnKeluar) btnKeluar.classList.add('d-none');
    });
  }

  // =========================================================================
  // MODUL TAB: REKAP KETIDAKHADIRAN SANTRI
  // =========================================================================

  function getRekapDateRange() {
    const periode = filterPeriodeRekap ? filterPeriodeRekap.value : 'this_month';
    const now = new Date();
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    if (periode === 'today') {
      const tgl = filterTanggalRekap && filterTanggalRekap.value ? filterTanggalRekap.value : fmt(now);
      return { startDate: tgl, endDate: tgl, label: 'Hari Ini (' + formatDateIndo(tgl) + ')' };
    }
    if (periode === 'this_week') {
      const day = now.getDay();
      const diffToMonday = (day === 0 ? 6 : day - 1);
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { startDate: fmt(monday), endDate: fmt(sunday), label: `Pekan Ini (${formatDateIndo(fmt(monday))} - ${formatDateIndo(fmt(sunday))})` };
    }
    if (periode === 'last_week') {
      const day = now.getDay();
      const diffToLastMonday = (day === 0 ? 6 : day - 1) + 7;
      const lastMonday = new Date(now);
      lastMonday.setDate(now.getDate() - diffToLastMonday);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      return { startDate: fmt(lastMonday), endDate: fmt(lastSunday), label: `Pekan Lalu (${formatDateIndo(fmt(lastMonday))} - ${formatDateIndo(fmt(lastSunday))})` };
    }
    if (periode === 'this_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { startDate: fmt(firstDay), endDate: fmt(lastDay), label: `Bulan Ini (${formatDateIndo(fmt(firstDay))} - ${formatDateIndo(fmt(lastDay))})` };
    }
    if (periode === 'last_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startDate: fmt(firstDay), endDate: fmt(lastDay), label: `Bulan Lalu (${formatDateIndo(fmt(firstDay))} - ${formatDateIndo(fmt(lastDay))})` };
    }
    if (periode === 'custom') {
      const start = filterStartDateRekap && filterStartDateRekap.value ? filterStartDateRekap.value : fmt(now);
      const end = filterEndDateRekap && filterEndDateRekap.value ? filterEndDateRekap.value : fmt(now);
      return { startDate: start, endDate: end, label: `${formatDateIndo(start)} s/d ${formatDateIndo(end)}` };
    }
    return { startDate: fmt(now), endDate: fmt(now), label: formatDateIndo(fmt(now)) };
  }

  async function fetchRekapAbsen(forceRefresh = false) {
    const range = getRekapDateRange();
    if (!tbodyRekapAbsen) return;

    tbodyRekapAbsen.innerHTML = `<tr><td colspan="8" class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div> Memuat data rekap ketidakhadiran (${range.label})...</td></tr>`;
    showLoading(true);

    try {
      const payload = { 
        action: 'get_log_kbm', 
        startDate: range.startDate, 
        endDate: range.endDate,
        tanggal: range.startDate 
      };

      const response = await fetch("https://script.google.com/macros/s/AKfycbxWjwlc6-mXpOimodZMFvQIC8hwdGRAz78PqnYIfQgSuXKkI9fUP4hXfC5x3QUIypiT/exec?action=get_log_kbm", {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const res = await response.json();

      if (res.success) {
        currentRawLogData = res.data || [];
        populateKelasFilterLog(currentRawLogData);
        populateKelasFilterRekap(currentRawLogData);
        populateKelasFilterKasus(currentRawLogData);
        processAndRenderRekapAbsen();
      } else {
        Swal.fire('Error', res.message || 'Gagal memuat data rekap.', 'error');
        tbodyRekapAbsen.innerHTML = `<tr><td colspan="8" class="text-center py-5 text-danger">Gagal memuat rekap ketidakhadiran.</td></tr>`;
      }
    } catch(e) {
      console.error(e);
      Swal.fire('Error', 'Terjadi kesalahan jaringan saat memuat rekap.', 'error');
      tbodyRekapAbsen.innerHTML = `<tr><td colspan="8" class="text-center py-5 text-danger">Terjadi kesalahan jaringan.</td></tr>`;
    } finally {
      showLoading(false);
    }
  }

  function populateKelasFilterRekap(data) {
    if (!filterKelasRekap) return;
    const currentVal = filterKelasRekap.value;
    const classes = [...new Set(data.map(d => d.kelas).filter(Boolean))].sort();
    filterKelasRekap.innerHTML = '<option value="Semua">Semua Kelas</option>';
    classes.forEach(c => {
      filterKelasRekap.innerHTML += `<option value="${c}">${c}</option>`;
    });
    if (classes.includes(currentVal)) {
      filterKelasRekap.value = currentVal;
    }
  }

  function processAndRenderRekapAbsen() {
    const rawLogs = currentRawLogData || [];
    const santriMap = new Map();

    rawLogs.forEach(logItem => {
      if (!logItem.status_isi) return;
      const santriList = logItem.catatan_santri || (window.santriDetailsCache && window.santriDetailsCache[logItem.id_jurnal]) || [];

      santriList.forEach(s => {
        const st = String(s.status || '').toLowerCase().trim();
        const isIzin = st.includes('izin');
        const isSakit = st.includes('sakit');
        const isAlfa = st.includes('alfa');

        if (!isIzin && !isSakit && !isAlfa) return;

        const sId = String(s.nis || s.id_santri || s.nama || '').trim();
        if (!sId) return;

        if (!santriMap.has(sId)) {
          santriMap.set(sId, {
            id: sId,
            nis: s.nis || s.id_santri || '-',
            nama: s.nama || s.nis || 'Santri Tanpa Nama',
            kelas: logItem.kelas || '-',
            izin: 0,
            sakit: 0,
            alfa: 0,
            records: []
          });
        }

        const entry = santriMap.get(sId);
        if (isIzin) entry.izin++;
        else if (isSakit) entry.sakit++;
        else if (isAlfa) entry.alfa++;

        entry.records.push({
          tanggal: logItem.tanggal,
          hari: logItem.hari,
          waktu: logItem.waktu,
          jam_ke: logItem.jam_ke,
          kelas: logItem.kelas,
          pelajaran: logItem.pelajaran,
          guru: logItem.guru,
          status: isIzin ? 'Izin' : (isSakit ? 'Sakit' : 'Alfa'),
          catatan: (s.catatan || logItem.catatan_kelas || '').trim() || '-'
        });
      });
    });

    currentRekapProcessedData = Array.from(santriMap.values());

    // Cache records per santri
    window.rekapSantriRecordsCache = {};
    currentRekapProcessedData.forEach(item => {
      window.rekapSantriRecordsCache[item.id] = item;
    });

    applyRekapFilters();
  }

  function applyRekapFilters() {
    if (!tbodyRekapAbsen) return;
    const kelasVal = filterKelasRekap ? filterKelasRekap.value : 'Semua';
    const searchVal = filterSearchRekap ? filterSearchRekap.value.toLowerCase().trim() : '';
    const sortVal = filterSortRekap ? filterSortRekap.value : 'total';

    const incIzin = checkKategoriIzin ? checkKategoriIzin.checked : true;
    const incSakit = checkKategoriSakit ? checkKategoriSakit.checked : true;
    const incAlfa = checkKategoriAlfa ? checkKategoriAlfa.checked : true;

    // Hitung activeTotal berdasarkan ceklist kategori terpilih
    let filtered = currentRekapProcessedData.map(item => {
      const activeTotal = (incIzin ? item.izin : 0) + (incSakit ? item.sakit : 0) + (incAlfa ? item.alfa : 0);
      return {
        ...item,
        activeTotal: activeTotal
      };
    }).filter(item => item.activeTotal > 0);

    // Filter Kelas
    if (kelasVal !== 'Semua') {
      filtered = filtered.filter(item => String(item.kelas).toLowerCase().trim() === String(kelasVal).toLowerCase().trim());
    }

    // Filter Search
    if (searchVal) {
      filtered = filtered.filter(item => 
        item.nama.toLowerCase().includes(searchVal) ||
        item.nis.toLowerCase().includes(searchVal) ||
        item.kelas.toLowerCase().includes(searchVal)
      );
    }

    // Sorting (Urutan Tertinggi)
    filtered.sort((a, b) => {
      if (currentSortRekap.col === 'nama') {
        return currentSortRekap.dir === 'asc' ? a.nama.localeCompare(b.nama) : b.nama.localeCompare(a.nama);
      } else if (currentSortRekap.col === 'kelas') {
        return currentSortRekap.dir === 'asc' ? a.kelas.localeCompare(b.kelas) : b.kelas.localeCompare(a.kelas);
      } else if (currentSortRekap.col === 'izin') {
        return currentSortRekap.dir === 'asc' ? a.izin - b.izin : b.izin - a.izin;
      } else if (currentSortRekap.col === 'sakit') {
        return currentSortRekap.dir === 'asc' ? a.sakit - b.sakit : b.sakit - a.sakit;
      } else if (currentSortRekap.col === 'alfa') {
        return currentSortRekap.dir === 'asc' ? a.alfa - b.alfa : b.alfa - a.alfa;
      } else {
        // Berdasarkan dropdown "Urutkan"
        if (sortVal === 'alfa') {
          return (b.alfa - a.alfa) || (b.activeTotal - a.activeTotal);
        } else if (sortVal === 'sakit') {
          return (b.sakit - a.sakit) || (b.activeTotal - a.activeTotal);
        } else if (sortVal === 'izin') {
          return (b.izin - a.izin) || (b.activeTotal - a.activeTotal);
        } else {
          return currentSortRekap.dir === 'asc' ? a.activeTotal - b.activeTotal : b.activeTotal - a.activeTotal;
        }
      }
    });

    updateRekapStats(filtered, currentRekapProcessedData);
    renderRekapTable(filtered);
  }

  function updateRekapStats(filtered, allRekap) {
    const elSantri = document.getElementById('rekap-stat-santri-count');
    const elIzin = document.getElementById('rekap-stat-total-izin');
    const elSakit = document.getElementById('rekap-stat-total-sakit');
    const elAlfa = document.getElementById('rekap-stat-total-alfa');

    let totalIzin = 0;
    let totalSakit = 0;
    let totalAlfa = 0;

    filtered.forEach(item => {
      totalIzin += item.izin;
      totalSakit += item.sakit;
      totalAlfa += item.alfa;
    });

    if (elSantri) elSantri.innerText = filtered.length;
    if (elIzin) elIzin.innerText = totalIzin;
    if (elSakit) elSakit.innerText = totalSakit;
    if (elAlfa) elAlfa.innerText = totalAlfa;
  }

  function renderRekapTable(data) {
    if (!tbodyRekapAbsen) return;
    if (!data || data.length === 0) {
      tbodyRekapAbsen.innerHTML = `<tr><td colspan="8" class="text-center py-5 text-muted"><div class="text-center mb-3"><i class="bi bi-person-check display-4 text-success opacity-50"></i></div>Tidak ada data ketidakhadiran untuk filter ini. Seluruh santri hadir atau filter belum sesuai.</td></tr>`;
      return;
    }

    tbodyRekapAbsen.innerHTML = '';
    data.forEach((item, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="text-center text-muted fw-semibold">${index + 1}</td>
        <td>
          <div class="fw-bold text-dark">${item.nama}</div>
          <small class="text-muted font-monospace" style="font-size: 11px;">NIS: ${item.nis}</small>
        </td>
        <td class="text-center">
          <span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-2 py-1">${item.kelas}</span>
        </td>
        <td class="text-center">
          ${item.izin > 0 ? `<span class="badge bg-warning text-dark rounded-pill px-2 py-1 fw-bold">${item.izin}</span>` : '<span class="text-muted small">-</span>'}
        </td>
        <td class="text-center">
          ${item.sakit > 0 ? `<span class="badge bg-info text-dark rounded-pill px-2 py-1 fw-bold">${item.sakit}</span>` : '<span class="text-muted small">-</span>'}
        </td>
        <td class="text-center">
          ${item.alfa > 0 ? `<span class="badge bg-danger rounded-pill px-2 py-1 fw-bold">${item.alfa}</span>` : '<span class="text-muted small">-</span>'}
        </td>
        <td class="text-center">
          <span class="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill px-3 py-1 fs-6 fw-bold">${item.activeTotal}</span>
        </td>
        <td class="text-center text-nowrap">
          <button class="btn btn-sm btn-outline-danger rounded-pill px-3 py-1 fw-semibold btn-detail-rekap" data-id="${item.id}" title="Lihat Rincian Ketidakhadiran">
            <i class="bi bi-journal-text me-1"></i> Rincian
          </button>
        </td>
      `;
      tbodyRekapAbsen.appendChild(tr);
    });

    // Bind event klik tombol Rincian
    document.querySelectorAll('.btn-detail-rekap').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const sId = e.currentTarget.getAttribute('data-id');
        openModalDetailRekapSantri(sId);
      });
    });
  }

  window.openModalDetailRekapSantri = function(santriId, selectedFilter) {
    const item = window.rekapSantriRecordsCache ? window.rekapSantriRecordsCache[santriId] : null;
    if (!item) {
      Swal.fire('Info', 'Data rincian santri tidak ditemukan.', 'info');
      return;
    }

    const modalTitle = document.getElementById('modal-rekap-santri-nama');
    const modalSub = document.getElementById('modal-rekap-santri-sub');
    const modalBody = document.getElementById('modal-rekap-santri-body');
    if (!modalBody) return;

    if (modalTitle) modalTitle.innerText = item.nama;
    if (modalSub) modalSub.innerText = `Kelas ${item.kelas} | NIS: ${item.nis}`;

    let currentModalFilter = selectedFilter || 'Semua';

    function renderModalContent() {
      let filteredRecords = item.records || [];
      if (currentModalFilter !== 'Semua') {
        filteredRecords = filteredRecords.filter(r => r.status.toLowerCase() === currentModalFilter.toLowerCase());
      }

      const getStatusBadge = (st) => {
        if (st === 'Izin') return '<span class="badge bg-warning text-dark">Izin</span>';
        if (st === 'Sakit') return '<span class="badge bg-info text-dark">Sakit</span>';
        if (st === 'Alfa') return '<span class="badge bg-danger">Alfa</span>';
        return `<span class="badge bg-secondary">${st}</span>`;
      };

      let summaryHtml = `
        <div class="p-3 bg-light rounded-3 mb-3 border">
          <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2">
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <span class="badge bg-white text-dark border px-2 py-1">Total: <b>${item.records.length}</b></span>
              <span class="badge bg-warning text-dark px-2 py-1">Izin: <b>${item.izin}</b></span>
              <span class="badge bg-info text-dark px-2 py-1">Sakit: <b>${item.sakit}</b></span>
              <span class="badge bg-danger text-white px-2 py-1">Alfa: <b>${item.alfa}</b></span>
            </div>
            <div class="btn-group btn-group-sm flex-wrap shadow-sm rounded-pill p-1 bg-white border" role="group">
              <button type="button" class="btn btn-sm ${currentModalFilter === 'Semua' ? 'btn-primary' : 'btn-light'} rounded-pill px-2 py-0 fw-medium btn-modal-filter-rekap" data-filter="Semua">Semua (${item.records.length})</button>
              <button type="button" class="btn btn-sm ${currentModalFilter === 'Izin' ? 'btn-warning text-dark' : 'btn-light'} rounded-pill px-2 py-0 fw-medium btn-modal-filter-rekap" data-filter="Izin">Izin (${item.izin})</button>
              <button type="button" class="btn btn-sm ${currentModalFilter === 'Sakit' ? 'btn-info text-dark' : 'btn-light'} rounded-pill px-2 py-0 fw-medium btn-modal-filter-rekap" data-filter="Sakit">Sakit (${item.sakit})</button>
              <button type="button" class="btn btn-sm ${currentModalFilter === 'Alfa' ? 'btn-danger' : 'btn-light'} rounded-pill px-2 py-0 fw-medium btn-modal-filter-rekap" data-filter="Alfa">Alfa (${item.alfa})</button>
            </div>
          </div>
        </div>
      `;

      let rowsHtml = '';
      if (filteredRecords.length === 0) {
        rowsHtml = `
          <div class="text-center py-4 text-muted">
            <i class="bi bi-clipboard-x display-6 text-secondary d-block mb-2"></i>
            Tidak ada riwayat untuk kategori status <b>${currentModalFilter}</b>.
          </div>
        `;
      } else {
        const rows = filteredRecords.map((r, idx) => `
          <tr>
            <td class="text-muted text-center small" style="width: 40px;">${idx + 1}</td>
            <td class="text-nowrap fw-semibold small">
              ${r.hari || '-'}, ${formatDateIndo(r.tanggal)}
              <div class="text-muted fw-normal" style="font-size: 11px;">Pukul ${r.waktu || '-'}</div>
            </td>
            <td>
              <div class="fw-medium">${r.pelajaran}</div>
              <small class="text-muted">Guru: ${r.guru}</small>
            </td>
            <td class="text-center" style="width: 90px;">${getStatusBadge(r.status)}</td>
            <td class="text-muted small">${r.catatan || '-'}</td>
          </tr>
        `).join('');

        rowsHtml = `
          <div class="table-responsive" style="max-height: 380px;">
            <table class="table table-sm table-hover align-middle mb-0">
              <thead class="table-light text-muted small position-sticky top-0">
                <tr>
                  <th class="text-center" style="width: 40px;">No</th>
                  <th>Tanggal & Waktu</th>
                  <th>Pelajaran & Guru</th>
                  <th class="text-center" style="width: 90px;">Status</th>
                  <th>Catatan / Alasan</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        `;
      }

      modalBody.innerHTML = summaryHtml + rowsHtml;

      modalBody.querySelectorAll('.btn-modal-filter-rekap').forEach(b => {
        b.addEventListener('click', (ev) => {
          currentModalFilter = ev.currentTarget.getAttribute('data-filter');
          renderModalContent();
        });
      });
    }

    renderModalContent();

    const btnPrintDetail = document.getElementById('btn-print-santri-detail');
    if (btnPrintDetail) {
      btnPrintDetail.onclick = () => window.print();
    }

    const modalEl = document.getElementById('modal-detail-rekap-santri');
    if (modalEl) {
      const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
      bsModal.show();
    }
  };

  function printRekapTable() {
    window.print();
  }

  // Bind Rekap Filters & Sort Headers
  if (filterPeriodeRekap) {
    filterPeriodeRekap.addEventListener('change', () => {
      const val = filterPeriodeRekap.value;
      if (val === 'today') {
        if (wrapperSingleDateRekap) wrapperSingleDateRekap.classList.remove('d-none');
        if (wrapperRangeTanggalRekap) wrapperRangeTanggalRekap.classList.add('d-none');
      } else if (val === 'custom') {
        if (wrapperSingleDateRekap) wrapperSingleDateRekap.classList.add('d-none');
        if (wrapperRangeTanggalRekap) wrapperRangeTanggalRekap.classList.remove('d-none');
        const now = new Date();
        const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!filterStartDateRekap.value) {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(now.getDate() - 7);
          filterStartDateRekap.value = fmt(sevenDaysAgo);
        }
        if (!filterEndDateRekap.value) filterEndDateRekap.value = fmt(now);
      } else {
        if (wrapperSingleDateRekap) wrapperSingleDateRekap.classList.add('d-none');
        if (wrapperRangeTanggalRekap) wrapperRangeTanggalRekap.classList.add('d-none');
      }
      fetchRekapAbsen();
    });
  }

  if (filterTanggalRekap) filterTanggalRekap.addEventListener('change', () => fetchRekapAbsen());
  if (btnApplyRangeRekap) btnApplyRangeRekap.addEventListener('click', () => fetchRekapAbsen());
  if (filterStartDateRekap) filterStartDateRekap.addEventListener('change', () => {
    if (filterPeriodeRekap && filterPeriodeRekap.value === 'custom') fetchRekapAbsen();
  });
  if (filterEndDateRekap) filterEndDateRekap.addEventListener('change', () => {
    if (filterPeriodeRekap && filterPeriodeRekap.value === 'custom') fetchRekapAbsen();
  });

  if (filterKelasRekap) filterKelasRekap.addEventListener('change', applyRekapFilters);
  if (filterSortRekap) filterSortRekap.addEventListener('change', applyRekapFilters);
  if (checkKategoriIzin) checkKategoriIzin.addEventListener('change', applyRekapFilters);
  if (checkKategoriSakit) checkKategoriSakit.addEventListener('change', applyRekapFilters);
  if (checkKategoriAlfa) checkKategoriAlfa.addEventListener('change', applyRekapFilters);
  if (filterSearchRekap) filterSearchRekap.addEventListener('input', applyRekapFilters);
  if (btnRefreshRekap) btnRefreshRekap.addEventListener('click', () => fetchRekapAbsen(true));
  if (btnPrintRekap) btnPrintRekap.addEventListener('click', printRekapTable);

  // Column headers sorting click
  document.querySelectorAll('.th-sortable-rekap').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-sort');
      if (currentSortRekap.col === col) {
        currentSortRekap.dir = (currentSortRekap.dir === 'asc') ? 'desc' : 'asc';
      } else {
        currentSortRekap.col = col;
        currentSortRekap.dir = (col === 'nama' || col === 'kelas') ? 'asc' : 'desc';
      }
      applyRekapFilters();
    });
  });

  // =========================================================================
  // INTERAKSI WIDGET STATISTIK REKAP (Santri Terdampak / Izin / Sakit / Alfa)
  // =========================================================================
  let currentRekapWidgetModalType = 'santri';
  let currentRekapWidgetRawList = [];

  function openRekapWidgetDetail(type) {
    currentRekapWidgetModalType = type;
    const modalEl = document.getElementById('modal-widget-detail-rekap');
    if (!modalEl) return;

    const headerEl = document.getElementById('modal-widget-rekap-header');
    const iconBox = document.getElementById('modal-widget-rekap-icon-box');
    const iconEl = document.getElementById('modal-widget-rekap-icon');
    const titleEl = document.getElementById('modal-widget-rekap-title');
    const subtitleEl = document.getElementById('modal-widget-rekap-subtitle');
    const closeBtn = document.getElementById('modal-widget-rekap-close-btn');
    const filterKelasEl = document.getElementById('modal-widget-rekap-filter-kelas');
    const searchInp = document.getElementById('modal-widget-rekap-search');

    if (searchInp) searchInp.value = '';

    // Populate kelas dropdown
    if (filterKelasEl) {
      const distinctClasses = [...new Set((currentRekapProcessedData || []).map(d => d.kelas).filter(Boolean))].sort();
      filterKelasEl.innerHTML = '<option value="Semua">Semua Kelas</option>' + 
        distinctClasses.map(c => `<option value="${c}">Kelas ${c}</option>`).join('');
      if (filterKelasRekap && filterKelasRekap.value !== 'Semua') {
        filterKelasEl.value = filterKelasRekap.value;
      }
    }

    // Styling & texts per type
    if (type === 'santri') {
      if (headerEl) headerEl.className = 'modal-header border-0 py-3 px-4 bg-primary text-white';
      if (iconBox) iconBox.className = 'bg-white rounded-3 p-2 d-flex align-items-center justify-content-center shadow-sm';
      if (iconEl) iconEl.className = 'bi bi-people-fill fs-5 text-primary';
      if (titleEl) titleEl.innerText = 'Daftar Santri Terdampak Ketidakhadiran';
      if (subtitleEl) subtitleEl.innerText = 'Daftar seluruh santri yang memiliki catatan ketidakhadiran pada periode aktif';
      if (closeBtn) closeBtn.className = 'btn-close btn-close-white';
    } else if (type === 'izin') {
      if (headerEl) headerEl.className = 'modal-header border-0 py-3 px-4 bg-warning text-dark';
      if (iconBox) iconBox.className = 'bg-white rounded-3 p-2 d-flex align-items-center justify-content-center shadow-sm';
      if (iconEl) iconEl.className = 'bi bi-info-circle-fill fs-5 text-warning';
      if (titleEl) titleEl.innerText = 'Rincian Seluruh Ketidakhadiran: IZIN';
      if (subtitleEl) subtitleEl.innerText = 'Daftar seluruh jam pelajaran izin santri beserta mapel, guru & alasan';
      if (closeBtn) closeBtn.className = 'btn-close';
    } else if (type === 'sakit') {
      if (headerEl) headerEl.className = 'modal-header border-0 py-3 px-4 bg-info text-dark';
      if (iconBox) iconBox.className = 'bg-white rounded-3 p-2 d-flex align-items-center justify-content-center shadow-sm';
      if (iconEl) iconEl.className = 'bi bi-heart-pulse-fill fs-5 text-info';
      if (titleEl) titleEl.innerText = 'Rincian Seluruh Ketidakhadiran: SAKIT';
      if (subtitleEl) subtitleEl.innerText = 'Daftar seluruh jam pelajaran sakit santri pada periode aktif';
      if (closeBtn) closeBtn.className = 'btn-close';
    } else if (type === 'alfa') {
      if (headerEl) headerEl.className = 'modal-header border-0 py-3 px-4 bg-danger text-white';
      if (iconBox) iconBox.className = 'bg-white rounded-3 p-2 d-flex align-items-center justify-content-center shadow-sm';
      if (iconEl) iconEl.className = 'bi bi-exclamation-octagon-fill fs-5 text-danger';
      if (titleEl) titleEl.innerText = 'Rincian Seluruh Ketidakhadiran: ALFA (Mangkir)';
      if (subtitleEl) subtitleEl.innerText = 'Daftar seluruh ketidakhadiran tanpa izin/keterangan yang memerlukan tindakan';
      if (closeBtn) closeBtn.className = 'btn-close btn-close-white';
    }

    // Siapkan list data
    if (type === 'santri') {
      currentRekapWidgetRawList = (currentRekapProcessedData || []).filter(s => (s.izin + s.sakit + s.alfa) > 0);
    } else {
      const events = [];
      (currentRekapProcessedData || []).forEach(s => {
        (s.records || []).forEach(r => {
          if (r.status && r.status.toLowerCase() === type.toLowerCase()) {
            events.push({
              nis: s.nis,
              nama: s.nama,
              kelas: s.kelas,
              id: s.id,
              tanggal: r.tanggal,
              hari: r.hari,
              waktu: r.waktu,
              pelajaran: r.pelajaran,
              guru: r.guru,
              status: r.status,
              catatan: r.catatan
            });
          }
        });
      });
      events.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
      currentRekapWidgetRawList = events;
    }

    renderRekapWidgetModalBody();

    const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    bsModal.show();
  }

  function renderRekapWidgetModalBody() {
    const bodyEl = document.getElementById('modal-widget-rekap-body');
    const countTxt = document.getElementById('modal-widget-rekap-count-txt');
    const filterKelasEl = document.getElementById('modal-widget-rekap-filter-kelas');
    const searchInp = document.getElementById('modal-widget-rekap-search');
    if (!bodyEl) return;

    const kelasVal = filterKelasEl ? filterKelasEl.value : 'Semua';
    const query = searchInp ? searchInp.value.toLowerCase().trim() : '';

    let filtered = currentRekapWidgetRawList || [];

    if (kelasVal !== 'Semua') {
      filtered = filtered.filter(item => String(item.kelas).toLowerCase().trim() === String(kelasVal).toLowerCase().trim());
    }

    if (query) {
      filtered = filtered.filter(item => {
        const text = (item.nama + ' ' + (item.nis || '') + ' ' + (item.kelas || '') + ' ' + (item.pelajaran || '') + ' ' + (item.guru || '') + ' ' + (item.catatan || '')).toLowerCase();
        return text.includes(query);
      });
    }

    if (countTxt) {
      if (currentRekapWidgetModalType === 'santri') {
        countTxt.innerText = `${filtered.length} Santri`;
      } else {
        countTxt.innerText = `${filtered.length} Jam Pelajaran (${currentRekapWidgetModalType.toUpperCase()})`;
      }
    }

    if (filtered.length === 0) {
      bodyEl.innerHTML = `
        <div class="text-center py-5 text-muted">
          <i class="bi bi-inbox fs-1 text-secondary opacity-50 d-block mb-2"></i>
          Tidak ada data yang cocok dengan pencarian atau filter kelas ini.
        </div>
      `;
      return;
    }

    if (currentRekapWidgetModalType === 'santri') {
      const rows = filtered.map((s, idx) => `
        <tr>
          <td class="text-center text-muted small" style="width: 40px;">${idx + 1}</td>
          <td>
            <div class="fw-bold text-dark">${s.nama}</div>
            <small class="text-muted font-monospace" style="font-size: 11px;">NIS: ${s.nis}</small>
          </td>
          <td class="text-center">
            <span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-2 py-1">${s.kelas}</span>
          </td>
          <td class="text-center">${s.izin > 0 ? `<span class="badge bg-warning text-dark rounded-pill px-2 py-1 fw-bold">${s.izin} JP</span>` : '<span class="text-muted small">-</span>'}</td>
          <td class="text-center">${s.sakit > 0 ? `<span class="badge bg-info text-dark rounded-pill px-2 py-1 fw-bold">${s.sakit} JP</span>` : '<span class="text-muted small">-</span>'}</td>
          <td class="text-center">${s.alfa > 0 ? `<span class="badge bg-danger rounded-pill px-2 py-1 fw-bold">${s.alfa} JP</span>` : '<span class="text-muted small">-</span>'}</td>
          <td class="text-center">
            <span class="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill px-3 py-1 fw-bold fs-6">${s.izin + s.sakit + s.alfa} JP</span>
          </td>
          <td class="text-center text-nowrap">
            <button class="btn btn-sm btn-outline-primary rounded-pill px-3 py-1 fw-semibold btn-modal-jump-santri" data-id="${s.id}" title="Buka Riwayat Lengkap Santri">
              <i class="bi bi-journal-text me-1"></i> Rincian
            </button>
          </td>
        </tr>
      `).join('');

      bodyEl.innerHTML = `
        <div class="table-responsive" style="max-height: 480px;">
          <table class="table table-sm table-hover align-middle mb-0">
            <thead class="table-light text-muted small position-sticky top-0 shadow-sm">
              <tr>
                <th class="text-center" style="width: 40px;">No</th>
                <th>Nama Santri</th>
                <th class="text-center">Kelas</th>
                <th class="text-center">Izin</th>
                <th class="text-center">Sakit</th>
                <th class="text-center">Alfa</th>
                <th class="text-center">Total JP</th>
                <th class="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      `;

      bodyEl.querySelectorAll('.btn-modal-jump-santri').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const sId = e.currentTarget.getAttribute('data-id');
          const modalEl = document.getElementById('modal-widget-detail-rekap');
          if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
          setTimeout(() => {
            openModalDetailRekapSantri(sId);
          }, 300);
        });
      });

    } else {
      const badgeStatus = (st) => {
        if (!st) return '';
        if (st.toLowerCase() === 'izin') return '<span class="badge bg-warning text-dark fw-bold">Izin</span>';
        if (st.toLowerCase() === 'sakit') return '<span class="badge bg-info text-dark fw-bold">Sakit</span>';
        if (st.toLowerCase() === 'alfa') return '<span class="badge bg-danger fw-bold">Alfa</span>';
        return `<span class="badge bg-secondary">${st}</span>`;
      };

      const rows = filtered.map((e, idx) => `
        <tr>
          <td class="text-center text-muted small" style="width: 40px;">${idx + 1}</td>
          <td class="text-nowrap small">
            <div class="fw-bold text-dark">${e.hari || '-'}, ${formatDateIndo(e.tanggal)}</div>
            <span class="text-muted" style="font-size: 11px;">Pukul ${e.waktu || '-'}</span>
          </td>
          <td class="text-center">
            <span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-2 py-1">${e.kelas}</span>
          </td>
          <td>
            <div class="fw-bold text-dark">${e.nama}</div>
            <small class="text-muted font-monospace" style="font-size: 11px;">NIS: ${e.nis}</small>
          </td>
          <td>
            <div class="fw-medium text-dark">${e.pelajaran}</div>
            <small class="text-muted">Guru: ${e.guru}</small>
          </td>
          <td class="text-center">${badgeStatus(e.status)}</td>
          <td class="small text-muted">${e.catatan ? `<div class="p-1 px-2 rounded bg-light border">${e.catatan}</div>` : '<span class="text-muted">-</span>'}</td>
        </tr>
      `).join('');

      bodyEl.innerHTML = `
        <div class="table-responsive" style="max-height: 480px;">
          <table class="table table-sm table-hover align-middle mb-0">
            <thead class="table-light text-muted small position-sticky top-0 shadow-sm">
              <tr>
                <th class="text-center" style="width: 40px;">No</th>
                <th>Tanggal & Waktu</th>
                <th class="text-center">Kelas</th>
                <th>Santri</th>
                <th>Mata Pelajaran & Guru</th>
                <th class="text-center">Status</th>
                <th>Keterangan / Alasan</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      `;
    }
  }

  // Bind Event Modal Widget Rekap Controls
  const modalRekapFilterKelas = document.getElementById('modal-widget-rekap-filter-kelas');
  const modalRekapSearch = document.getElementById('modal-widget-rekap-search');
  if (modalRekapFilterKelas) modalRekapFilterKelas.addEventListener('change', renderRekapWidgetModalBody);
  if (modalRekapSearch) modalRekapSearch.addEventListener('input', renderRekapWidgetModalBody);

  const btnApplyRekapWidgetFilter = document.getElementById('btn-apply-rekap-widget-filter');
  if (btnApplyRekapWidgetFilter) {
    btnApplyRekapWidgetFilter.addEventListener('click', () => {
      const t = currentRekapWidgetModalType;
      if (t === 'santri') {
        if (checkKategoriIzin) checkKategoriIzin.checked = true;
        if (checkKategoriSakit) checkKategoriSakit.checked = true;
        if (checkKategoriAlfa) checkKategoriAlfa.checked = true;
      } else if (t === 'izin') {
        if (checkKategoriIzin) checkKategoriIzin.checked = true;
        if (checkKategoriSakit) checkKategoriSakit.checked = false;
        if (checkKategoriAlfa) checkKategoriAlfa.checked = false;
        if (filterSortRekap) filterSortRekap.value = 'izin';
      } else if (t === 'sakit') {
        if (checkKategoriIzin) checkKategoriIzin.checked = false;
        if (checkKategoriSakit) checkKategoriSakit.checked = true;
        if (checkKategoriAlfa) checkKategoriAlfa.checked = false;
        if (filterSortRekap) filterSortRekap.value = 'sakit';
      } else if (t === 'alfa') {
        if (checkKategoriIzin) checkKategoriIzin.checked = false;
        if (checkKategoriSakit) checkKategoriSakit.checked = false;
        if (checkKategoriAlfa) checkKategoriAlfa.checked = true;
        if (filterSortRekap) filterSortRekap.value = 'alfa';
      }
      if (modalRekapFilterKelas && filterKelasRekap) {
        filterKelasRekap.value = modalRekapFilterKelas.value;
      }
      applyRekapFilters();
      const modalEl = document.getElementById('modal-widget-detail-rekap');
      if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
    });
  }

  const btnPrintRekapWidgetDetail = document.getElementById('btn-print-rekap-widget-detail');
  if (btnPrintRekapWidgetDetail) {
    btnPrintRekapWidgetDetail.addEventListener('click', () => window.print());
  }

  // Bind Card Click Events (Rekap)
  const cardRekapSantri = document.getElementById('card-rekap-santri');
  const cardRekapIzin = document.getElementById('card-rekap-izin');
  const cardRekapSakit = document.getElementById('card-rekap-sakit');
  const cardRekapAlfa = document.getElementById('card-rekap-alfa');

  if (cardRekapSantri) cardRekapSantri.addEventListener('click', () => openRekapWidgetDetail('santri'));
  if (cardRekapIzin) cardRekapIzin.addEventListener('click', () => openRekapWidgetDetail('izin'));
  if (cardRekapSakit) cardRekapSakit.addEventListener('click', () => openRekapWidgetDetail('sakit'));
  if (cardRekapAlfa) cardRekapAlfa.addEventListener('click', () => openRekapWidgetDetail('alfa'));


  // =========================================================================
  // MODUL TAB: CATATAN PERMASALAHAN SESUAI KELAS
  // =========================================================================

  function getKasusDateRange() {
    const mode = filterModeWaktuKasus ? filterModeWaktuKasus.value : 'bulan';
    const now = new Date();
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    if (mode === 'pekan') {
      const sub = filterPilihanPekanKasus ? filterPilihanPekanKasus.value : 'this_week';
      if (sub === 'this_week') {
        const day = now.getDay();
        const diffToMonday = (day === 0 ? 6 : day - 1);
        const monday = new Date(now);
        monday.setDate(now.getDate() - diffToMonday);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        return { startDate: fmt(monday), endDate: fmt(sunday), label: `Pekan Ini (${formatDateIndo(fmt(monday))} - ${formatDateIndo(fmt(sunday))})` };
      } else {
        const day = now.getDay();
        const diffToLastMonday = (day === 0 ? 6 : day - 1) + 7;
        const lastMonday = new Date(now);
        lastMonday.setDate(now.getDate() - diffToLastMonday);
        const lastSunday = new Date(lastMonday);
        lastSunday.setDate(lastMonday.getDate() + 6);
        return { startDate: fmt(lastMonday), endDate: fmt(lastSunday), label: `Pekan Lalu (${formatDateIndo(fmt(lastMonday))} - ${formatDateIndo(fmt(lastSunday))})` };
      }
    } else if (mode === 'rentang') {
      const start = filterStartDateKasus && filterStartDateKasus.value ? filterStartDateKasus.value : fmt(now);
      const end = filterEndDateKasus && filterEndDateKasus.value ? filterEndDateKasus.value : fmt(now);
      return { startDate: start, endDate: end, label: `${formatDateIndo(start)} s/d ${formatDateIndo(end)}` };
    } else {
      // Mode 'bulan'
      const sub = filterPilihanBulanKasus ? filterPilihanBulanKasus.value : 'this_month';
      if (sub === 'this_month') {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return { startDate: fmt(firstDay), endDate: fmt(lastDay), label: `Bulan Ini (${formatDateIndo(fmt(firstDay))} - ${formatDateIndo(fmt(lastDay))})` };
      } else if (sub === 'last_month') {
        const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
        return { startDate: fmt(firstDay), endDate: fmt(lastDay), label: `Bulan Lalu (${formatDateIndo(fmt(firstDay))} - ${formatDateIndo(fmt(lastDay))})` };
      } else {
        const m = parseInt(filterKasusMonthSelect ? filterKasusMonthSelect.value : (now.getMonth() + 1));
        const y = parseInt(filterKasusYearSelect ? filterKasusYearSelect.value : now.getFullYear());
        const firstDay = new Date(y, m - 1, 1);
        const lastDay = new Date(y, m, 0);
        return { startDate: fmt(firstDay), endDate: fmt(lastDay), label: `Bulan ${m}/${y} (${formatDateIndo(fmt(firstDay))} - ${formatDateIndo(fmt(lastDay))})` };
      }
    }
  }

  async function fetchCatatanKasus(forceRefresh = false) {
    const range = getKasusDateRange();
    if (!feedKasusList) return;

    feedKasusList.innerHTML = `<div class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div> Memuat catatan permasalahan (${range.label})...</div>`;
    if (tbodyKasusTable) tbodyKasusTable.innerHTML = `<tr><td colspan="7" class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div> Memuat catatan permasalahan...</td></tr>`;
    showLoading(true);

    try {
      const payload = { 
        action: 'get_log_kbm', 
        startDate: range.startDate, 
        endDate: range.endDate,
        tanggal: range.startDate 
      };

      const response = await fetch("https://script.google.com/macros/s/AKfycbxWjwlc6-mXpOimodZMFvQIC8hwdGRAz78PqnYIfQgSuXKkI9fUP4hXfC5x3QUIypiT/exec?action=get_log_kbm", {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const res = await response.json();

      if (res.success) {
        currentRawLogData = res.data || [];
        populateKelasFilterLog(currentRawLogData);
        populateKelasFilterRekap(currentRawLogData);
        populateKelasFilterKasus(currentRawLogData);
        processAndRenderCatatanKasus();
      } else {
        Swal.fire('Error', res.message || 'Gagal memuat catatan permasalahan.', 'error');
        feedKasusList.innerHTML = `<div class="text-center py-5 text-danger">Gagal memuat catatan permasalahan.</div>`;
      }
    } catch(e) {
      console.error(e);
      Swal.fire('Error', 'Terjadi kesalahan jaringan saat memuat catatan.', 'error');
      feedKasusList.innerHTML = `<div class="text-center py-5 text-danger">Terjadi kesalahan jaringan.</div>`;
    } finally {
      showLoading(false);
    }
  }

  function populateKelasFilterKasus(data) {
    if (!kasusQuickKelasPills) return;
    const classes = [...new Set(data.map(d => d.kelas).filter(Boolean))].sort();
    
    kasusQuickKelasPills.innerHTML = `<span class="small text-muted fw-bold me-1"><i class="bi bi-funnel me-1 text-primary"></i>Pilih Kelas:</span>`;
    
    const btnSemua = document.createElement('button');
    btnSemua.className = `btn btn-sm btn-filter-kelas-pill ${currentSelectedKelasKasus === 'Semua' ? 'active' : ''} rounded-pill px-3 py-0`;
    btnSemua.innerText = 'Semua Kelas';
    btnSemua.addEventListener('click', () => {
      currentSelectedKelasKasus = 'Semua';
      updateKasusPillActiveState();
      applyKasusFilters();
    });
    kasusQuickKelasPills.appendChild(btnSemua);

    classes.forEach(c => {
      const btn = document.createElement('button');
      btn.className = `btn btn-sm btn-filter-kelas-pill ${currentSelectedKelasKasus === c ? 'active' : ''} rounded-pill px-3 py-0`;
      btn.innerText = `Kelas ${c}`;
      btn.addEventListener('click', () => {
        currentSelectedKelasKasus = c;
        updateKasusPillActiveState();
        applyKasusFilters();
      });
      kasusQuickKelasPills.appendChild(btn);
    });
  }

  function updateKasusPillActiveState() {
    if (!kasusQuickKelasPills) return;
    const buttons = kasusQuickKelasPills.querySelectorAll('.btn-filter-kelas-pill');
    buttons.forEach(btn => {
      const txt = btn.innerText.replace('Kelas ', '').trim();
      if ((currentSelectedKelasKasus === 'Semua' && txt === 'Semua Kelas') || txt === currentSelectedKelasKasus) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  function processAndRenderCatatanKasus() {
    const rawLogs = currentRawLogData || [];
    const events = [];

    rawLogs.forEach(logItem => {
      if (!logItem.status_isi) return;

      const catatanKelas = (logItem.catatan_kelas || '').trim();
      const santriList = logItem.catatan_santri || (window.santriDetailsCache && window.santriDetailsCache[logItem.id_jurnal]) || [];

      const santriCatatan = [];
      const santriAlfa = [];

      santriList.forEach(s => {
        const st = String(s.status || '').toLowerCase().trim();
        const cat = (s.catatan || '').trim();
        if (cat) {
          santriCatatan.push({
            nama: s.nama || s.nis || 'Santri',
            status: s.status || 'Hadir',
            catatan: cat
          });
        }
        if (st.includes('alfa')) {
          santriAlfa.push({
            nama: s.nama || s.nis || 'Santri',
            nis: s.nis || '-'
          });
        }
      });

      const hasCatatanKelas = catatanKelas.length > 0;
      const hasSantriCatatan = santriCatatan.length > 0;
      const hasAlfa = santriAlfa.length > 0;

      if (hasCatatanKelas || hasSantriCatatan || hasAlfa) {
        let tipe = 'Catatan Kejadian Kelas/KBM';
        if (hasSantriCatatan && hasCatatanKelas) tipe = 'KBM & Adab Santri';
        else if (hasSantriCatatan) tipe = 'Catatan Adab / Perilaku Santri';
        else if (hasAlfa && !hasCatatanKelas) tipe = 'Santri Alfa / Mangkir';

        events.push({
          id_jurnal: logItem.id_jurnal,
          tanggal: logItem.tanggal,
          hari: logItem.hari,
          waktu: logItem.waktu,
          jam_ke: logItem.jam_ke,
          kelas: logItem.kelas,
          pelajaran: logItem.pelajaran,
          guru: logItem.guru,
          materi: logItem.materi,
          catatan_kelas: catatanKelas,
          santri_catatan: santriCatatan,
          santri_alfa: santriAlfa,
          hasCatatanKelas: hasCatatanKelas,
          hasSantriCatatan: hasSantriCatatan,
          hasAlfa: hasAlfa,
          tipe: tipe
        });
      }
    });

    currentKasusProcessedData = events;
    applyKasusFilters();
  }

  function applyKasusFilters() {
    const searchVal = filterSearchKasus ? filterSearchKasus.value.toLowerCase().trim() : '';
    const tipeVal = filterTipeKasus ? filterTipeKasus.value : 'Semua';

    let filtered = currentKasusProcessedData;

    // Filter Kelas
    if (currentSelectedKelasKasus !== 'Semua') {
      filtered = filtered.filter(item => String(item.kelas).toLowerCase().trim() === String(currentSelectedKelasKasus).toLowerCase().trim());
    }

    // Filter Tipe Permasalahan
    if (tipeVal === 'kelas') {
      filtered = filtered.filter(item => item.hasCatatanKelas);
    } else if (tipeVal === 'santri') {
      filtered = filtered.filter(item => item.hasSantriCatatan);
    } else if (tipeVal === 'alfa') {
      filtered = filtered.filter(item => item.hasAlfa);
    }

    // Filter Search
    if (searchVal) {
      filtered = filtered.filter(item => {
        const matchText = (item.catatan_kelas + ' ' + item.guru + ' ' + item.pelajaran + ' ' + item.materi + ' ' + item.kelas).toLowerCase();
        const matchSantri = item.santri_catatan.some(s => (s.nama + ' ' + s.catatan).toLowerCase().includes(searchVal)) ||
                            item.santri_alfa.some(s => s.nama.toLowerCase().includes(searchVal));
        return matchText.includes(searchVal) || matchSantri;
      });
    }

    updateKasusStats(filtered, currentKasusProcessedData);
    renderKasusFeed(filtered);
    renderKasusTable(filtered);
  }

  function updateKasusStats(filtered, allEvents) {
    const elTotal = document.getElementById('kasus-stat-total');
    const elKelas = document.getElementById('kasus-stat-kelas');
    const elSantri = document.getElementById('kasus-stat-santri');
    const elKelasCount = document.getElementById('kasus-stat-kelas-count');

    let totalKelasCatatan = 0;
    let totalSantriCatatan = 0;
    const distinctClasses = new Set();

    filtered.forEach(item => {
      if (item.hasCatatanKelas) totalKelasCatatan++;
      if (item.hasSantriCatatan || item.hasAlfa) totalSantriCatatan += (item.santri_catatan.length + item.santri_alfa.length);
      if (item.kelas) distinctClasses.add(item.kelas);
    });

    if (elTotal) elTotal.innerText = filtered.length;
    if (elKelas) elKelas.innerText = totalKelasCatatan;
    if (elSantri) elSantri.innerText = totalSantriCatatan;
    if (elKelasCount) elKelasCount.innerText = distinctClasses.size;
  }

  function renderKasusFeed(data) {
    if (!feedKasusList) return;
    if (!data || data.length === 0) {
      feedKasusList.innerHTML = `
        <div class="text-center py-5 text-muted">
          <div class="mb-3"><i class="bi bi-shield-check display-4 text-success opacity-50"></i></div>
          <h6 class="fw-bold">Tidak ada catatan permasalahan ditemukan</h6>
          <p class="small text-muted mb-0">Tidak terdapat kendala KBM, catatan adab santri, maupun santri alfa pada filter dan periode ini.</p>
        </div>
      `;
      return;
    }

    feedKasusList.innerHTML = '';
    data.forEach(item => {
      const card = document.createElement('div');
      let borderClass = 'border-catatan-kelas';
      if (item.hasSantriCatatan) borderClass = 'border-catatan-santri';
      else if (item.hasAlfa && !item.hasCatatanKelas) borderClass = 'border-catatan-alfa';

      card.className = `card border-0 shadow-sm rounded-4 p-3 p-md-4 bg-white kasus-card ${borderClass}`;

      let catatanKelasHtml = '';
      if (item.hasCatatanKelas) {
        catatanKelasHtml = `
          <div class="mb-3">
            <span class="small fw-bold text-muted d-block mb-1"><i class="bi bi-chat-left-text text-warning me-1"></i>Catatan Pembelajaran / Kelas:</span>
            <div class="kasus-quote-box border-warning">
              ${item.catatan_kelas}
            </div>
          </div>
        `;
      }

      let santriCatatanHtml = '';
      if (item.santri_catatan && item.santri_catatan.length > 0) {
        const listBadges = item.santri_catatan.map(s => `
          <div class="santri-badge-tag mb-1">
            <i class="bi bi-person-exclamation text-danger"></i>
            <span class="fw-bold">${s.nama}</span>: <span class="text-dark">${s.catatan}</span>
          </div>
        `).join(' ');

        santriCatatanHtml = `
          <div class="mb-2">
            <span class="small fw-bold text-muted d-block mb-1"><i class="bi bi-exclamation-circle text-danger me-1"></i>Catatan Adab / Perilaku Santri:</span>
            <div class="d-flex flex-wrap gap-1">
              ${listBadges}
            </div>
          </div>
        `;
      }

      let santriAlfaHtml = '';
      if (item.santri_alfa && item.santri_alfa.length > 0) {
        const names = item.santri_alfa.map(s => `<span class="badge bg-danger rounded-pill px-2 py-1">${s.nama}</span>`).join(' ');
        santriAlfaHtml = `
          <div class="mt-2">
            <span class="small fw-bold text-muted d-block mb-1"><i class="bi bi-person-x-fill text-danger me-1"></i>Santri Tidak Hadir (Alfa):</span>
            <div class="d-flex flex-wrap gap-1">
              ${names}
            </div>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2 pb-2 mb-3 border-bottom">
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <span class="badge bg-primary rounded-pill px-3 py-1 fw-bold">Kelas ${item.kelas}</span>
            <span class="badge bg-light text-dark border px-2 py-1"><i class="bi bi-calendar3 me-1 text-primary"></i>${item.hari || '-'}, ${formatDateIndo(item.tanggal)}</span>
            <span class="badge bg-light text-muted border px-2 py-1"><i class="bi bi-clock me-1"></i>${item.waktu || '-'} s/d ${item.jam_ke || '-'}</span>
          </div>
          <span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle rounded-pill px-3 py-1 small fw-semibold">
            ${item.tipe}
          </span>
        </div>

        <div class="row g-2 mb-3 small">
          <div class="col-md-6">
            <span class="text-muted d-block">Mata Pelajaran:</span>
            <strong class="text-dark fs-6">${item.pelajaran}</strong>
          </div>
          <div class="col-md-6">
            <span class="text-muted d-block">Guru Pengajar:</span>
            <strong class="text-primary fs-6">${item.guru}</strong>
          </div>
          ${item.materi ? `
          <div class="col-12 mt-1">
            <span class="text-muted">Materi KBM: </span>
            <span class="text-dark fw-medium">${item.materi}</span>
          </div>` : ''}
        </div>

        ${catatanKelasHtml}
        ${santriCatatanHtml}
        ${santriAlfaHtml}
      `;

      feedKasusList.appendChild(card);
    });
  }

  function renderKasusTable(data) {
    if (!tbodyKasusTable) return;
    if (!data || data.length === 0) {
      tbodyKasusTable.innerHTML = `<tr><td colspan="7" class="text-center py-5 text-muted">Tidak ada catatan permasalahan ditemukan.</td></tr>`;
      return;
    }

    tbodyKasusTable.innerHTML = '';
    data.forEach((item, index) => {
      const tr = document.createElement('tr');

      let deskripsi = item.catatan_kelas || '-';
      let santriDetail = [];
      if (item.santri_catatan && item.santri_catatan.length > 0) {
        santriDetail.push(...item.santri_catatan.map(s => `<span class="badge bg-danger-subtle text-danger border border-danger-subtle">${s.nama}: ${s.catatan}</span>`));
      }
      if (item.santri_alfa && item.santri_alfa.length > 0) {
        santriDetail.push(...item.santri_alfa.map(s => `<span class="badge bg-danger">Alfa: ${s.nama}</span>`));
      }

      tr.innerHTML = `
        <td class="text-center text-muted fw-semibold">${index + 1}</td>
        <td class="text-nowrap small">
          <div class="fw-bold">${formatDateIndo(item.tanggal)}</div>
          <span class="text-muted">${item.hari || '-'} (${item.waktu || '-'})</span>
        </td>
        <td class="text-center">
          <span class="badge bg-primary">${item.kelas}</span>
        </td>
        <td>
          <div class="fw-semibold text-dark">${item.pelajaran}</div>
          <small class="text-muted">${item.guru}</small>
        </td>
        <td>
          <span class="badge bg-light text-dark border small">${item.tipe}</span>
        </td>
        <td class="small">
          <div>${deskripsi}</div>
          ${item.materi ? `<div class="text-muted fst-italic" style="font-size: 11px;">Materi: ${item.materi}</div>` : ''}
        </td>
        <td class="small">
          <div class="d-flex flex-wrap gap-1">
            ${santriDetail.length > 0 ? santriDetail.join(' ') : '<span class="text-muted">-</span>'}
          </div>
        </td>
      `;
      tbodyKasusTable.appendChild(tr);
    });
  }

  window.switchKasusView = function(mode) {
    currentKasusViewMode = mode;
    if (btnViewFeed && btnViewTable) {
      if (mode === 'feed') {
        btnViewFeed.classList.remove('btn-light');
        btnViewFeed.classList.add('btn-primary');
        btnViewTable.classList.remove('btn-primary');
        btnViewTable.classList.add('btn-light');
        if (containerKasusFeed) containerKasusFeed.classList.remove('d-none');
        if (containerKasusTable) containerKasusTable.classList.add('d-none');
      } else {
        btnViewTable.classList.remove('btn-light');
        btnViewTable.classList.add('btn-primary');
        btnViewFeed.classList.remove('btn-primary');
        btnViewFeed.classList.add('btn-light');
        if (containerKasusFeed) containerKasusFeed.classList.add('d-none');
        if (containerKasusTable) containerKasusTable.classList.remove('d-none');
      }
    }
  };

  function printKasusReport() {
    window.print();
  }

  // Bind Catatan Kasus Filters
  if (filterModeWaktuKasus) {
    filterModeWaktuKasus.addEventListener('change', () => {
      const mode = filterModeWaktuKasus.value;
      if (mode === 'bulan') {
        if (wrapperKasusBulan) wrapperKasusBulan.classList.remove('d-none');
        if (wrapperKasusPekan) wrapperKasusPekan.classList.add('d-none');
        if (wrapperKasusRentang) wrapperKasusRentang.classList.add('d-none');
      } else if (mode === 'pekan') {
        if (wrapperKasusBulan) wrapperKasusBulan.classList.add('d-none');
        if (wrapperKasusPekan) wrapperKasusPekan.classList.remove('d-none');
        if (wrapperKasusRentang) wrapperKasusRentang.classList.add('d-none');
      } else {
        if (wrapperKasusBulan) wrapperKasusBulan.classList.add('d-none');
        if (wrapperKasusPekan) wrapperKasusPekan.classList.add('d-none');
        if (wrapperKasusRentang) wrapperKasusRentang.classList.remove('d-none');
      }
      fetchCatatanKasus();
    });
  }

  if (filterPilihanBulanKasus) {
    filterPilihanBulanKasus.addEventListener('change', () => {
      const val = filterPilihanBulanKasus.value;
      if (val === 'specific_month') {
        if (wrapperSpecificMonth) wrapperSpecificMonth.classList.remove('d-none');
      } else {
        if (wrapperSpecificMonth) wrapperSpecificMonth.classList.add('d-none');
      }
      fetchCatatanKasus();
    });
  }

  if (filterKasusMonthSelect) filterKasusMonthSelect.addEventListener('change', () => fetchCatatanKasus());
  if (filterKasusYearSelect) filterKasusYearSelect.addEventListener('change', () => fetchCatatanKasus());
  if (filterPilihanPekanKasus) filterPilihanPekanKasus.addEventListener('change', () => fetchCatatanKasus());
  if (btnApplyRangeKasus) btnApplyRangeKasus.addEventListener('click', () => fetchCatatanKasus());
  if (filterStartDateKasus) filterStartDateKasus.addEventListener('change', () => {
    if (filterModeWaktuKasus && filterModeWaktuKasus.value === 'rentang') fetchCatatanKasus();
  });
  if (filterEndDateKasus) filterEndDateKasus.addEventListener('change', () => {
    if (filterModeWaktuKasus && filterModeWaktuKasus.value === 'rentang') fetchCatatanKasus();
  });

  if (filterTipeKasus) filterTipeKasus.addEventListener('change', applyKasusFilters);
  if (filterSearchKasus) filterSearchKasus.addEventListener('input', applyKasusFilters);
  if (btnRefreshKasus) btnRefreshKasus.addEventListener('click', () => fetchCatatanKasus(true));
  if (btnPrintKasus) btnPrintKasus.addEventListener('click', printKasusReport);

  // =========================================================================
  // INTERAKSI WIDGET STATISTIK CATATAN KASUS (Total / KBM / Kasus Santri / Kelas)
  // =========================================================================
  let currentKasusWidgetModalType = 'total';

  function openKasusWidgetDetail(type) {
    currentKasusWidgetModalType = type;
    const modalEl = document.getElementById('modal-widget-detail-kasus');
    if (!modalEl) return;

    const headerEl = document.getElementById('modal-widget-kasus-header');
    const iconBox = document.getElementById('modal-widget-kasus-icon-box');
    const iconEl = document.getElementById('modal-widget-kasus-icon');
    const titleEl = document.getElementById('modal-widget-kasus-title');
    const subtitleEl = document.getElementById('modal-widget-kasus-subtitle');
    const closeBtn = document.getElementById('modal-widget-kasus-close-btn');
    const filterKelasEl = document.getElementById('modal-widget-kasus-filter-kelas');
    const searchInp = document.getElementById('modal-widget-kasus-search');

    if (searchInp) searchInp.value = '';

    // Populate kelas dropdown
    if (filterKelasEl) {
      const distinctClasses = [...new Set((currentKasusProcessedData || []).map(d => d.kelas).filter(Boolean))].sort();
      filterKelasEl.innerHTML = '<option value="Semua">Semua Kelas</option>' + 
        distinctClasses.map(c => `<option value="${c}">Kelas ${c}</option>`).join('');
      if (currentSelectedKelasKasus !== 'Semua') {
        filterKelasEl.value = currentSelectedKelasKasus;
      }
    }

    // Styling & texts per type
    if (type === 'total') {
      if (headerEl) headerEl.className = 'modal-header border-0 py-3 px-4 bg-warning text-dark';
      if (iconBox) iconBox.className = 'bg-white rounded-3 p-2 d-flex align-items-center justify-content-center shadow-sm';
      if (iconEl) iconEl.className = 'bi bi-journal-text fs-5 text-warning';
      if (titleEl) titleEl.innerText = 'Rincian Seluruh Catatan Kejadian KBM';
      if (subtitleEl) subtitleEl.innerText = 'Daftar seluruh catatan kejadian pembelajaran, kendala kelas, dan adab santri';
      if (closeBtn) closeBtn.className = 'btn-close';
    } else if (type === 'kbm') {
      if (headerEl) headerEl.className = 'modal-header border-0 py-3 px-4 bg-primary text-white';
      if (iconBox) iconBox.className = 'bg-white rounded-3 p-2 d-flex align-items-center justify-content-center shadow-sm';
      if (iconEl) iconEl.className = 'bi bi-chat-left-quote-fill fs-5 text-primary';
      if (titleEl) titleEl.innerText = 'Rincian Catatan Pembelajaran & Kendala Kelas';
      if (subtitleEl) subtitleEl.innerText = 'Catatan guru terkait kondisi kelas, fasilitas, penguasaan materi, dan dinamika KBM';
      if (closeBtn) closeBtn.className = 'btn-close btn-close-white';
    } else if (type === 'santri') {
      if (headerEl) headerEl.className = 'modal-header border-0 py-3 px-4 bg-danger text-white';
      if (iconBox) iconBox.className = 'bg-white rounded-3 p-2 d-flex align-items-center justify-content-center shadow-sm';
      if (iconEl) iconEl.className = 'bi bi-person-exclamation fs-5 text-danger';
      if (titleEl) titleEl.innerText = 'Rincian Kasus Adab & Santri Khusus';
      if (subtitleEl) subtitleEl.innerText = 'Catatan guru khusus mengenai perilaku santri yang memerlukan perhatian dewan guru';
      if (closeBtn) closeBtn.className = 'btn-close btn-close-white';
    } else if (type === 'kelas_count') {
      if (headerEl) headerEl.className = 'modal-header border-0 py-3 px-4 bg-dark text-white';
      if (iconBox) iconBox.className = 'bg-white rounded-3 p-2 d-flex align-items-center justify-content-center shadow-sm';
      if (iconEl) iconEl.className = 'bi bi-building fs-5 text-secondary';
      if (titleEl) titleEl.innerText = 'Rekapitulasi Sebaran Permasalahan Per Kelas';
      if (subtitleEl) subtitleEl.innerText = 'Perbandingan tingkat kejadian kendala KBM dan catatan adab antar kelas';
      if (closeBtn) closeBtn.className = 'btn-close btn-close-white';
    }

    renderKasusWidgetModalBody();

    const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    bsModal.show();
  }

  function renderKasusWidgetModalBody() {
    const bodyEl = document.getElementById('modal-widget-kasus-body');
    const countTxt = document.getElementById('modal-widget-kasus-count-txt');
    const filterKelasEl = document.getElementById('modal-widget-kasus-filter-kelas');
    const searchInp = document.getElementById('modal-widget-kasus-search');
    if (!bodyEl) return;

    const kelasVal = filterKelasEl ? filterKelasEl.value : 'Semua';
    const query = searchInp ? searchInp.value.toLowerCase().trim() : '';

    let data = currentKasusProcessedData || [];

    if (kelasVal !== 'Semua') {
      data = data.filter(item => String(item.kelas).toLowerCase().trim() === String(kelasVal).toLowerCase().trim());
    }

    if (currentKasusWidgetModalType === 'kbm') {
      data = data.filter(item => item.hasCatatanKelas);
    } else if (currentKasusWidgetModalType === 'santri') {
      data = data.filter(item => item.hasSantriCatatan || item.hasAlfa);
    }

    if (query) {
      data = data.filter(item => {
        const text = (item.catatan_kelas + ' ' + item.guru + ' ' + item.pelajaran + ' ' + item.materi + ' ' + item.kelas).toLowerCase();
        const matchSantri = (item.santri_catatan || []).some(s => (s.nama + ' ' + s.catatan).toLowerCase().includes(query)) ||
                            (item.santri_alfa || []).some(s => s.nama.toLowerCase().includes(query));
        return text.includes(query) || matchSantri;
      });
    }

    // Jika tipe adalah kelas_count, buat ringkasan agregat per kelas
    if (currentKasusWidgetModalType === 'kelas_count') {
      const classMap = {};
      (currentKasusProcessedData || []).forEach(item => {
        const kl = item.kelas || 'Lainnya';
        if (!classMap[kl]) {
          classMap[kl] = { kelas: kl, total: 0, kbm: 0, santri: 0, alfa: 0, items: [] };
        }
        classMap[kl].total++;
        if (item.hasCatatanKelas) classMap[kl].kbm++;
        if (item.hasSantriCatatan) classMap[kl].santri += item.santri_catatan.length;
        if (item.hasAlfa) classMap[kl].alfa += item.santri_alfa.length;
        classMap[kl].items.push(item);
      });

      let classList = Object.values(classMap);
      if (query) {
        classList = classList.filter(c => c.kelas.toLowerCase().includes(query));
      }
      classList.sort((a, b) => b.total - a.total);

      if (countTxt) countTxt.innerText = `${classList.length} Kelas Memiliki Catatan`;

      if (classList.length === 0) {
        bodyEl.innerHTML = `<div class="text-center py-5 text-muted"><i class="bi bi-shield-check fs-1 text-success opacity-50 d-block mb-2"></i>Tidak ada data kelas yang terpantau.</div>`;
        return;
      }

      const rows = classList.map((c, idx) => `
        <tr>
          <td class="text-center text-muted small">${idx + 1}</td>
          <td>
            <span class="badge bg-primary fs-6 px-3 py-1 rounded-pill">Kelas ${c.kelas}</span>
          </td>
          <td class="text-center">
            <span class="badge bg-warning text-dark rounded-pill px-3 py-1 fw-bold fs-6">${c.total} Kejadian</span>
          </td>
          <td class="text-center">
            <span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-2 py-1">${c.kbm} Catatan</span>
          </td>
          <td class="text-center">
            <span class="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill px-2 py-1">${c.santri} Kasus</span>
          </td>
          <td class="text-center">
            <span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle rounded-pill px-2 py-1">${c.alfa} Alfa</span>
          </td>
          <td class="text-center text-nowrap">
            <button class="btn btn-sm btn-outline-primary rounded-pill px-3 py-1 fw-semibold btn-filter-this-class" data-kelas="${c.kelas}">
              <i class="bi bi-funnel me-1"></i> Buka Kasus Kelas
            </button>
          </td>
        </tr>
      `).join('');

      bodyEl.innerHTML = `
        <div class="table-responsive" style="max-height: 480px;">
          <table class="table table-hover align-middle mb-0">
            <thead class="table-light text-muted small position-sticky top-0 shadow-sm">
              <tr>
                <th class="text-center" style="width: 40px;">No</th>
                <th>Tingkat / Kelas</th>
                <th class="text-center">Total Kejadian</th>
                <th class="text-center">Catatan KBM</th>
                <th class="text-center">Kasus Adab Santri</th>
                <th class="text-center">Santri Alfa</th>
                <th class="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      `;

      bodyEl.querySelectorAll('.btn-filter-this-class').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const targetKelas = e.currentTarget.getAttribute('data-kelas');
          currentSelectedKelasKasus = targetKelas;
          updateKasusPillActiveState();
          applyKasusFilters();
          const modalEl = document.getElementById('modal-widget-detail-kasus');
          if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
        });
      });
      return;
    }

    if (countTxt) countTxt.innerText = `${data.length} Kejadian Tercatat`;

    if (data.length === 0) {
      bodyEl.innerHTML = `<div class="text-center py-5 text-muted"><i class="bi bi-shield-check fs-1 text-success opacity-50 d-block mb-2"></i>Tidak ada catatan permasalahan yang sesuai filter.</div>`;
      return;
    }

    if (currentKasusWidgetModalType === 'santri') {
      const listSantriRows = [];
      data.forEach(item => {
        (item.santri_catatan || []).forEach(s => {
          listSantriRows.push({
            tanggal: item.tanggal,
            hari: item.hari,
            waktu: item.waktu,
            kelas: item.kelas,
            pelajaran: item.pelajaran,
            guru: item.guru,
            nama: s.nama,
            tipe: 'Catatan Adab / Perilaku',
            catatan: s.catatan
          });
        });
        (item.santri_alfa || []).forEach(s => {
          listSantriRows.push({
            tanggal: item.tanggal,
            hari: item.hari,
            waktu: item.waktu,
            kelas: item.kelas,
            pelajaran: item.pelajaran,
            guru: item.guru,
            nama: s.nama,
            tipe: 'Alfa / Mangkir',
            catatan: 'Tidak hadir tanpa keterangan (Alfa)'
          });
        });
      });

      listSantriRows.sort((a, b) => b.tanggal.localeCompare(a.tanggal));

      const rows = listSantriRows.map((s, idx) => `
        <tr>
          <td class="text-center text-muted small" style="width: 40px;">${idx + 1}</td>
          <td class="text-nowrap small">
            <div class="fw-bold text-dark">${s.hari || '-'}, ${formatDateIndo(s.tanggal)}</div>
            <span class="text-muted" style="font-size: 11px;">Pukul ${s.waktu || '-'}</span>
          </td>
          <td class="text-center">
            <span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-2 py-1">${s.kelas}</span>
          </td>
          <td>
            <div class="fw-bold text-dark">${s.nama}</div>
          </td>
          <td>
            <div class="fw-medium text-dark">${s.pelajaran}</div>
            <small class="text-muted">Guru: ${s.guru}</small>
          </td>
          <td>
            <span class="badge ${s.tipe.includes('Alfa') ? 'bg-danger' : 'bg-warning text-dark'} rounded-pill px-2 py-1">${s.tipe}</span>
          </td>
          <td class="small text-danger fw-medium">
            <div class="p-2 rounded bg-danger-subtle border border-danger-subtle">${s.catatan}</div>
          </td>
        </tr>
      `).join('');

      bodyEl.innerHTML = `
        <div class="table-responsive" style="max-height: 480px;">
          <table class="table table-sm table-hover align-middle mb-0">
            <thead class="table-light text-muted small position-sticky top-0 shadow-sm">
              <tr>
                <th class="text-center" style="width: 40px;">No</th>
                <th>Tanggal & Waktu</th>
                <th class="text-center">Kelas</th>
                <th>Nama Santri</th>
                <th>Mata Pelajaran & Guru</th>
                <th>Kategori</th>
                <th>Catatan Adab / Keterangan</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      `;
    } else {
      const cardsHtml = data.map((item, idx) => {
        let santriDetail = [];
        if (item.santri_catatan && item.santri_catatan.length > 0) {
          santriDetail.push(...item.santri_catatan.map(s => `
            <div class="santri-badge-tag mb-1">
              <i class="bi bi-person-exclamation text-danger"></i>
              <span class="fw-bold">${s.nama}</span>: <span>${s.catatan}</span>
            </div>
          `));
        }
        if (item.santri_alfa && item.santri_alfa.length > 0) {
          santriDetail.push(...item.santri_alfa.map(s => `<span class="badge bg-danger rounded-pill px-2 py-1 me-1">Alfa: ${s.nama}</span>`));
        }

        return `
          <div class="card border rounded-4 p-3 mb-3 shadow-sm bg-white">
            <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 pb-2 mb-2 border-bottom">
              <div class="d-flex align-items-center gap-2 flex-wrap">
                <span class="badge bg-primary rounded-pill px-3 py-1 fw-bold">Kelas ${item.kelas}</span>
                <span class="badge bg-light text-dark border px-2 py-1"><i class="bi bi-calendar3 me-1 text-primary"></i>${item.hari || '-'}, ${formatDateIndo(item.tanggal)}</span>
                <span class="badge bg-light text-muted border px-2 py-1"><i class="bi bi-clock me-1"></i>${item.waktu || '-'}</span>
              </div>
              <span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle rounded-pill px-2 py-1 small">
                ${item.tipe}
              </span>
            </div>
            <div class="row g-2 mb-2 small">
              <div class="col-md-6">
                <span class="text-muted">Pelajaran: </span><strong class="text-dark">${item.pelajaran}</strong>
              </div>
              <div class="col-md-6">
                <span class="text-muted">Guru: </span><strong class="text-primary">${item.guru}</strong>
              </div>
              ${item.materi ? `<div class="col-12"><span class="text-muted">Materi: </span><span class="text-dark fst-italic">${item.materi}</span></div>` : ''}
            </div>
            ${item.hasCatatanKelas ? `
              <div class="mt-2">
                <span class="small fw-bold text-muted d-block mb-1"><i class="bi bi-chat-left-text text-warning me-1"></i>Catatan Kelas / Kendala KBM:</span>
                <div class="kasus-quote-box border-warning">${item.catatan_kelas}</div>
              </div>
            ` : ''}
            ${santriDetail.length > 0 ? `
              <div class="mt-2">
                <span class="small fw-bold text-muted d-block mb-1"><i class="bi bi-person-exclamation text-danger me-1"></i>Catatan Santri Terkait:</span>
                <div class="d-flex flex-wrap gap-1">${santriDetail.join(' ')}</div>
              </div>
            ` : ''}
          </div>
        `;
      }).join('');

      bodyEl.innerHTML = `<div style="max-height: 480px; overflow-y: auto; padding-right: 4px;">${cardsHtml}</div>`;
    }
  }

  // Bind Event Modal Widget Kasus Controls
  const modalKasusFilterKelas = document.getElementById('modal-widget-kasus-filter-kelas');
  const modalKasusSearch = document.getElementById('modal-widget-kasus-search');
  if (modalKasusFilterKelas) modalKasusFilterKelas.addEventListener('change', renderKasusWidgetModalBody);
  if (modalKasusSearch) modalKasusSearch.addEventListener('input', renderKasusWidgetModalBody);

  const btnApplyKasusWidgetFilter = document.getElementById('btn-apply-kasus-widget-filter');
  if (btnApplyKasusWidgetFilter) {
    btnApplyKasusWidgetFilter.addEventListener('click', () => {
      const t = currentKasusWidgetModalType;
      if (filterTipeKasus) {
        if (t === 'kbm') filterTipeKasus.value = 'kelas';
        else if (t === 'santri') filterTipeKasus.value = 'santri';
        else filterTipeKasus.value = 'Semua';
      }
      const modalKelas = document.getElementById('modal-widget-kasus-filter-kelas');
      if (modalKelas) {
        currentSelectedKelasKasus = modalKelas.value;
        updateKasusPillActiveState();
      }
      applyKasusFilters();
      const modalEl = document.getElementById('modal-widget-detail-kasus');
      if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
    });
  }

  const btnPrintKasusWidgetDetail = document.getElementById('btn-print-kasus-widget-detail');
  if (btnPrintKasusWidgetDetail) {
    btnPrintKasusWidgetDetail.addEventListener('click', () => window.print());
  }

  // Bind Card Click Events (Kasus)
  const cardKasusTotal = document.getElementById('card-kasus-total');
  const cardKasusKbm = document.getElementById('card-kasus-kbm');
  const cardKasusSantri = document.getElementById('card-kasus-santri');
  const cardKasusKelasCount = document.getElementById('card-kasus-kelas-count');

  if (cardKasusTotal) cardKasusTotal.addEventListener('click', () => openKasusWidgetDetail('total'));
  if (cardKasusKbm) cardKasusKbm.addEventListener('click', () => openKasusWidgetDetail('kbm'));
  if (cardKasusSantri) cardKasusSantri.addEventListener('click', () => openKasusWidgetDetail('santri'));
  if (cardKasusKelasCount) cardKasusKelasCount.addEventListener('click', () => openKasusWidgetDetail('kelas_count'));

  // Enable cascade selects and filter based on selected Guru
  selGuru.addEventListener('change', updateMapel);
  selMapel.addEventListener('change', updateKelas);
  selKelas.addEventListener('change', updateJam);
  selJam.addEventListener('change', () => {
    if (selJam.value) {
      btnLoad.disabled = false;
      startProgressBar();
    }
  });

  function updateMapel() {
    const selectedGuru = selGuru.value;
    const guruJadwals = allJadwal.filter(j => j.ID_Staff === selectedGuru);
    
    const uniqueMapelIds = [...new Set(guruJadwals.map(j => j.ID_Mapel))].filter(Boolean);
    selMapel.innerHTML = '<option value="" selected disabled>-- Pilih Pelajaran --</option>';
    uniqueMapelIds.forEach(id => {
      const mapelObj = allMapel.find(m => m.ID_Mapel === id);
      const namaMapel = mapelObj ? mapelObj.Nama_Mapel : id;
      selMapel.innerHTML += `<option value="${id}">${namaMapel}</option>`;
    });
    
    selMapel.disabled = true;
    
    const clockActions = document.getElementById('clock-actions');
    const btnJamKeluar = document.getElementById('btn-jam-keluar');
    
    if(btnJamKeluar) btnJamKeluar.classList.add('d-none');
    
    if(uniqueMapelIds.length > 0) {
      if(clockActions) clockActions.classList.remove('d-none');
    } else {
      if(clockActions) clockActions.classList.add('d-none');
    }
    
    if (uniqueMapelIds.length === 1) {
      selMapel.value = uniqueMapelIds[0];
      updateKelas();
    } else {
      selKelas.innerHTML = '<option value="" selected disabled>-- Pilih Kelas --</option>';
      selKelas.disabled = true;
      selJam.innerHTML = '<option value="" selected disabled>-- Pilih Jam --</option>';
      selJam.disabled = true;
      btnLoad.disabled = true;
    }
  }

  function updateKelas() {
    const selectedGuru = selGuru.value;
    const selectedMapel = selMapel.value;
    const guruJadwals = allJadwal.filter(j => j.ID_Staff === selectedGuru && j.ID_Mapel === selectedMapel);
    
    const uniqueKelas = [...new Set(guruJadwals.map(j => j.Kelas))].filter(Boolean);
    selKelas.innerHTML = '<option value="" selected disabled>-- Pilih Kelas --</option>';
    uniqueKelas.forEach(k => selKelas.innerHTML += `<option value="${k}">${k}</option>`);
    
    selKelas.disabled = uniqueKelas.length === 0;
    
    if (uniqueKelas.length === 1) {
      selKelas.value = uniqueKelas[0];
      updateJam();
    } else {
      selJam.innerHTML = '<option value="" selected disabled>-- Pilih Jam --</option>';
      selJam.disabled = true;
      btnLoad.disabled = true;
    }
  }

  function updateJam() {
    const selectedGuru = selGuru.value;
    const selectedMapel = selMapel.value;
    const selectedKelas = selKelas.value;
    const guruJadwals = allJadwal.filter(j => j.ID_Staff === selectedGuru && j.ID_Mapel === selectedMapel && String(j.Kelas) === String(selectedKelas));
    
    const uniqueJamObjects = [];
    guruJadwals.forEach(j => {
      let jamText = "";
      if (j.Jam_Mulai && j.Jam_Selesai) {
        jamText = `${formatTime(j.Jam_Mulai)} - ${formatTime(j.Jam_Selesai)}`;
      } else {
        jamText = j.Jam_Mengajar || j.Jam || (j.Jam_Mulai + ' - ' + j.Jam_Selesai);
      }
      jamText = j.Hari ? `${j.Hari}, ${jamText}` : jamText;
      
      if(!uniqueJamObjects.find(u => u.text === jamText)) {
        uniqueJamObjects.push({ text: jamText, id: j.ID_Jadwal });
      }
    });
    
    selJam.innerHTML = '<option value="" selected disabled>-- Pilih Jam --</option>';
    uniqueJamObjects.forEach(jam => selJam.innerHTML += `<option value="${jam.text}" data-id="${jam.id}">${jam.text}</option>`);
    
    selJam.disabled = uniqueJamObjects.length === 0;
    
    if (uniqueJamObjects.length === 1) {
      selJam.value = uniqueJamObjects[0].text;
      btnLoad.disabled = false;
      startProgressBar();
    } else {
      btnLoad.disabled = true;
    }
  }

  // Call Init
  initData();

  function normalizeKelas(k) {
    if (!k && k !== 0) return '';
    const str = String(k).trim().toUpperCase();
    if (str === '7' || str === '7 SMP' || str === '7SMP' || str === 'VII' || str === 'KELAS 7' || str === 'KELAS 7 SMP') return '7 SMP';
    if (str === '8' || str === '8 SMP' || str === '8SMP' || str === 'VIII' || str === 'KELAS 8' || str === 'KELAS 8 SMP') return '8 SMP';
    if (str === '9' || str === '9 SMP' || str === '9SMP' || str === 'IX' || str === 'KELAS 9' || str === 'KELAS 9 SMP') return '9 SMP';
    if (str === '10' || str === '10 SMA' || str === '10SMA' || str === 'X' || str === 'KELAS 10' || str === 'KELAS 10 SMA') return '10 SMA';
    if (str === '11' || str === '11 SMA' || str === '11SMA' || str === 'XI' || str === 'KELAS 11' || str === 'KELAS 11 SMA') return '11 SMA';
    if (str === '12' || str === '12 SMA' || str === '12SMA' || str === 'XII' || str === 'KELAS 12' || str === 'KELAS 12 SMA') return '12 SMA';
    return str;
  }

  // Load Santri
  btnLoad.addEventListener('click', () => {
    if(!selGuru.value || !selKelas.value) return;
    
    showLoading(true);
    
    const selectedKelasName = selKelas.value;
    const targetNormKelas = normalizeKelas(selectedKelasName);
    
    // Filter santri asli dari database berdasarkan kelas dengan normalisasi cerdas & deduplikasi ketat
    const santriMap = new Map();
    allSantri.forEach(s => {
      // Filter status santri: abaikan santri Non-Aktif / Alumni / Keluar
      const sStatus = String(s.status_aktif || s.Status_Aktif || s.status || s.Status || 'aktif').trim().toLowerCase();
      const isAktif = sStatus === 'aktif' || sStatus === 'active' || sStatus === '1' || sStatus === '';
      if (!isAktif) return;

      const k1 = normalizeKelas(s.kelas || s.Kelas);
      const isClassMatch = (k1 === targetNormKelas || String(s.kelas) === String(selectedKelasName) || String(s.Kelas) === String(selectedKelasName));
      if (isClassMatch) {
        const nis = String(s.nis || s.NIS || s.id_santri || s.ID_Santri || '').trim();
        const nama = (s.nama || s.Nama_Lengkap || s.Nama_Santri || s.Nama || '').trim();
        const key = nis ? `NIS_${nis}` : `NAMA_${nama.toLowerCase()}`;
        if (key && !santriMap.has(key)) {
          santriMap.set(key, s);
        }
      }
    });
    
    let generatedSantri = Array.from(santriMap.values());
    
    // Urutkan secara alfabetis berdasarkan nama santri
    generatedSantri.sort((a, b) => {
      const nA = (a.Nama || a.Nama_Santri || a.Nama_Lengkap || a.nama || '').trim();
      const nB = (b.Nama || b.Nama_Santri || b.Nama_Lengkap || b.nama || '').trim();
      return nA.localeCompare(nB, 'id', { sensitivity: 'base' });
    });
    
    // Jika tidak ada santri ditemukan, berikan fallback
    if(generatedSantri.length === 0) {
      console.warn("Tidak ada santri ditemukan untuk kelas " + selectedKelasName);
    }
    
    // Format data santri agar sesuai dengan fungsi renderSantri (butuh id dan nama)
    const formattedSantri = generatedSantri.map((s, i) => ({
      id: s.id_santri || s.ID_Santri || s.nis || `S${i}`,
      nama: s.nama || s.Nama_Lengkap || s.Nama_Santri || s.Nama || 'Santri Tidak Dikenal',
      nis: s.nis || s.NIS || '',
      uid_card: s.uid_card || s.UID_Card || ''
    }));
    
    // Simulate API Fetch delay for UX
    setTimeout(() => {
      document.getElementById('content-area').classList.remove('d-none');
      renderSantri(formattedSantri);
      showLoading(false);
      
      // Auto-scroll to content
      document.getElementById('content-area').scrollIntoView({ behavior: 'smooth' });
    }, 800);
  });

  let currentLoadedSantri = [];
  let kbmNilaiState = {
    tipe_nilai: 'Tugas',
    materi: '',
    nilai_santri: {}
  };

  function renderSantri(data) {
    currentLoadedSantri = data || [];
    kbmNilaiState = {
      tipe_nilai: 'Tugas',
      materi: document.getElementById('input-materi') ? document.getElementById('input-materi').value : '',
      nilai_santri: {}
    };

    const badgeNilai = document.getElementById('badge-nilai-status');
    if (badgeNilai) {
      badgeNilai.className = 'badge bg-primary-subtle text-primary ms-1';
      badgeNilai.innerText = 'Opsional';
    }

    const tbody = document.getElementById('santri-tbody');
    document.getElementById('santri-count').innerText = data.length + " Santri";
    tbody.innerHTML = '';
    
    data.forEach((s, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="ps-4 fw-medium">
          <div class="d-flex align-items-center gap-3">
            <div class="avatar bg-light text-primary rounded-circle d-flex align-items-center justify-content-center fw-bold" style="width: 32px; height: 32px; font-size: 0.8rem;">
              ${i+1}
            </div>
            ${s.nama}
          </div>
        </td>
        <td class="text-center">
          <div class="attendance-radios">
            <input type="radio" name="abs_${s.id}" id="hadir_${s.id}" value="Hadir" checked>
            <label for="hadir_${s.id}">Hadir</label>
            
            <input type="radio" name="abs_${s.id}" id="sakit_${s.id}" value="Sakit">
            <label for="sakit_${s.id}">Sakit</label>
            
            <input type="radio" name="abs_${s.id}" id="izin_${s.id}" value="Izin">
            <label for="izin_${s.id}">Izin</label>
            
            <input type="radio" name="abs_${s.id}" id="alfa_${s.id}" value="Alfa">
            <label for="alfa_${s.id}">Alfa</label>
          </div>
        </td>
        <td class="pe-4">
          <input type="text" class="form-control form-control-sm bg-light" placeholder="Keterangan / Catatan santri..." id="catatan_${s.id}">
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Pasang auto-save pada setiap radio dan input catatan santri
    tbody.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('change', () => saveSessionState());
      inp.addEventListener('input', () => saveSessionState());
    });

    // Reset input pencarian saat data santri baru dirender
    const searchInp = document.getElementById('search-santri');
    if (searchInp) searchInp.value = '';
    
    // Auto-save state saat data santri dimuat
    saveSessionState();
  }

  // --- Pencarian Nama Santri Real-Time ---
  const searchSantriInput = document.getElementById('search-santri');
  if (searchSantriInput) {
    searchSantriInput.addEventListener('input', () => {
      const q = searchSantriInput.value.toLowerCase().trim();
      const rows = document.querySelectorAll('#santri-tbody tr');
      let visibleCount = 0;
      rows.forEach(tr => {
        const text = tr.innerText.toLowerCase();
        if (!q || text.includes(q)) {
          tr.style.display = '';
          visibleCount++;
        } else {
          tr.style.display = 'none';
        }
      });
      const countBadge = document.getElementById('santri-count');
      if (countBadge) {
        if (q) {
          countBadge.innerText = `${visibleCount} dari ${rows.length} Santri`;
        } else {
          countBadge.innerText = `${rows.length} Santri`;
        }
      }
    });
  }

  // --- Mode Fullscreen / Zoom Tabel Presensi ---
  const btnFullscreenSantri = document.getElementById('btn-fullscreen-santri');
  const cardPresensiSantri = document.getElementById('card-presensi-santri');
  if (btnFullscreenSantri && cardPresensiSantri) {
    btnFullscreenSantri.addEventListener('click', () => {
      const isFullscreen = cardPresensiSantri.classList.toggle('table-fullscreen-mode');
      if (isFullscreen) {
        btnFullscreenSantri.innerHTML = '<i class="bi bi-fullscreen-exit text-danger"></i>';
        btnFullscreenSantri.title = 'Keluar Mode Layar Penuh';
        if (cardPresensiSantri.requestFullscreen) {
          cardPresensiSantri.requestFullscreen().catch(() => {});
        }
      } else {
        btnFullscreenSantri.innerHTML = '<i class="bi bi-arrows-fullscreen"></i>';
        btnFullscreenSantri.title = 'Mode Layar Penuh (Zoom)';
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      }
    });

    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && cardPresensiSantri.classList.contains('table-fullscreen-mode')) {
        cardPresensiSantri.classList.remove('table-fullscreen-mode');
        btnFullscreenSantri.innerHTML = '<i class="bi bi-arrows-fullscreen"></i>';
        btnFullscreenSantri.title = 'Mode Layar Penuh (Zoom)';
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && cardPresensiSantri.classList.contains('table-fullscreen-mode')) {
        cardPresensiSantri.classList.remove('table-fullscreen-mode');
        btnFullscreenSantri.innerHTML = '<i class="bi bi-arrows-fullscreen"></i>';
        btnFullscreenSantri.title = 'Mode Layar Penuh (Zoom)';
      }
    });
  }

  // --- Modal Penilaian KBM / Nilai Harian Events ---
  const btnOpenModalNilai = document.getElementById('btn-open-modal-nilai');
  const btnModalApplyAllNilai = document.getElementById('btn-modal-apply-all-nilai');
  const btnModalSaveNilai = document.getElementById('btn-modal-save-nilai');
  const inputModalSearchNilai = document.getElementById('modal-nilai-search');
  const btnClearSearchNilai = document.getElementById('btn-clear-search-nilai');
  const modalNilaiTbody = document.getElementById('modal-nilai-tbody');

  function escapeHtmlSafe(str) {
    if (!str && str !== 0) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function updateModalNilaiCounters(shownCount) {
    if (!modalNilaiTbody) return;
    const total = (currentLoadedSantri && currentLoadedSantri.length) ? currentLoadedSantri.length : 0;
    const allInputs = modalNilaiTbody.querySelectorAll('.input-modal-nilai');
    let filled = 0;
    allInputs.forEach(inp => {
      if (inp.value.trim() !== '') filled++;
    });

    const shown = (shownCount !== undefined) ? shownCount : total;
    const countInfoEl = document.getElementById('modal-nilai-count-info');
    if (countInfoEl) {
      if (shown === total) {
        countInfoEl.innerHTML = `<i class="bi bi-people me-1 text-primary"></i>Total: <b>${total}</b> santri`;
      } else {
        countInfoEl.innerHTML = `<i class="bi bi-funnel me-1 text-warning"></i>Menampilkan: <b>${shown}</b> dari ${total} santri`;
      }
    }

    const filledInfoEl = document.getElementById('modal-nilai-filled-info');
    if (filledInfoEl) {
      filledInfoEl.innerHTML = `<i class="bi bi-check2-all me-1 text-success"></i><b>${filled}</b> dari ${total} dinilai`;
    }
  }

  function filterModalNilaiSantri() {
    if (!modalNilaiTbody) return;
    const query = inputModalSearchNilai ? inputModalSearchNilai.value.trim().toLowerCase() : '';
    
    if (btnClearSearchNilai) {
      if (query !== '') {
        btnClearSearchNilai.classList.remove('d-none');
      } else {
        btnClearSearchNilai.classList.add('d-none');
      }
    }

    const rows = modalNilaiTbody.querySelectorAll('tr.row-santri-nilai');
    let matchCount = 0;

    rows.forEach(tr => {
      const nama = tr.getAttribute('data-nama') || '';
      const nis = tr.getAttribute('data-nis') || '';
      const isMatch = !query || nama.includes(query) || nis.includes(query);

      if (isMatch) {
        tr.style.display = '';
        matchCount++;
      } else {
        tr.style.display = 'none';
      }
    });

    let emptyRow = document.getElementById('modal-nilai-empty-search');
    if (matchCount === 0) {
      if (!emptyRow) {
        emptyRow = document.createElement('tr');
        emptyRow.id = 'modal-nilai-empty-search';
        emptyRow.innerHTML = `
          <td colspan="4" class="text-center py-4 text-muted">
            <i class="bi bi-person-x fs-3 text-secondary d-block mb-1"></i>
            Santri dengan kata kunci "<b>${escapeHtmlSafe(query)}</b>" tidak ditemukan.
          </td>
        `;
        modalNilaiTbody.appendChild(emptyRow);
      } else {
        emptyRow.style.display = '';
        emptyRow.innerHTML = `
          <td colspan="4" class="text-center py-4 text-muted">
            <i class="bi bi-person-x fs-3 text-secondary d-block mb-1"></i>
            Santri dengan kata kunci "<b>${escapeHtmlSafe(query)}</b>" tidak ditemukan.
          </td>
        `;
      }
    } else if (emptyRow) {
      emptyRow.style.display = 'none';
    }

    updateModalNilaiCounters(matchCount);
  }

  if (inputModalSearchNilai) {
    inputModalSearchNilai.addEventListener('input', filterModalNilaiSantri);
    inputModalSearchNilai.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Fokuskan ke input nilai santri pertama yang tampak
        const firstVisibleRow = modalNilaiTbody.querySelector('tr.row-santri-nilai:not([style*="display: none"])');
        if (firstVisibleRow) {
          const firstInp = firstVisibleRow.querySelector('.input-modal-nilai');
          if (firstInp) {
            firstInp.focus();
            firstInp.select();
          }
        }
      } else if (e.key === 'Escape') {
        inputModalSearchNilai.value = '';
        filterModalNilaiSantri();
      }
    });
  }

  if (btnClearSearchNilai) {
    btnClearSearchNilai.addEventListener('click', () => {
      if (inputModalSearchNilai) {
        inputModalSearchNilai.value = '';
        filterModalNilaiSantri();
        inputModalSearchNilai.focus();
      }
    });
  }

  if (btnOpenModalNilai) {
    btnOpenModalNilai.addEventListener('click', () => {
      if (!currentLoadedSantri || currentLoadedSantri.length === 0) {
        Swal.fire('Perhatian', 'Silakan pilih jadwal dan muat data santri terlebih dahulu.', 'warning');
        return;
      }

      // Sync materi input if not filled
      const inpMateri = document.getElementById('input-materi');
      const modalMateri = document.getElementById('modal-nilai-materi');
      if (modalMateri && inpMateri && !modalMateri.value) {
        modalMateri.value = inpMateri.value;
      }

      if (inputModalSearchNilai) {
        inputModalSearchNilai.value = '';
      }
      if (btnClearSearchNilai) {
        btnClearSearchNilai.classList.add('d-none');
      }

      modalNilaiTbody.innerHTML = '';

      currentLoadedSantri.forEach((s, idx) => {
        const existing = (kbmNilaiState.nilai_santri && kbmNilaiState.nilai_santri[s.id]) || { nilai: '', catatan: '' };
        const tr = document.createElement('tr');
        tr.className = 'row-santri-nilai';
        tr.setAttribute('data-id', s.id);
        tr.setAttribute('data-nama', (s.nama || '').toLowerCase());
        tr.setAttribute('data-nis', (s.nis || '').toLowerCase());
        tr.innerHTML = `
          <td class="text-muted small text-center">${idx + 1}</td>
          <td>
            <div class="fw-semibold text-dark">${escapeHtmlSafe(s.nama)}</div>
            ${s.nis ? `<div class="text-muted small" style="font-size: 11px;">NIS: ${escapeHtmlSafe(s.nis)}</div>` : ''}
          </td>
          <td>
            <input type="number" class="form-control form-control-sm text-center input-modal-nilai" data-id="${s.id}" data-idx="${idx}" value="${existing.nilai || ''}" placeholder="0-100" min="0" max="100">
          </td>
          <td>
            <input type="text" class="form-control form-control-sm input-modal-catatan" data-id="${s.id}" value="${escapeHtmlSafe(existing.catatan || '')}" placeholder="Catatan...">
          </td>
        `;
        modalNilaiTbody.appendChild(tr);
      });

      // Pasang event listener pada setiap input nilai (live counter & navigasi keyboard)
      const allNilaiInps = modalNilaiTbody.querySelectorAll('.input-modal-nilai');
      allNilaiInps.forEach(inp => {
        inp.addEventListener('input', () => {
          updateModalNilaiCounters();
        });

        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            // Navigasi ke input santri tampak berikutnya
            const currentTr = inp.closest('tr.row-santri-nilai');
            let nextTr = currentTr ? currentTr.nextElementSibling : null;
            while (nextTr) {
              if (nextTr.classList.contains('row-santri-nilai') && nextTr.style.display !== 'none') {
                const nextInp = nextTr.querySelector('.input-modal-nilai');
                if (nextInp) {
                  nextInp.focus();
                  nextInp.select();
                }
                break;
              }
              nextTr = nextTr.nextElementSibling;
            }
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            // Navigasi ke input santri tampak sebelumnya
            const currentTr = inp.closest('tr.row-santri-nilai');
            let prevTr = currentTr ? currentTr.previousElementSibling : null;
            while (prevTr) {
              if (prevTr.classList.contains('row-santri-nilai') && prevTr.style.display !== 'none') {
                const prevInp = prevTr.querySelector('.input-modal-nilai');
                if (prevInp) {
                  prevInp.focus();
                  prevInp.select();
                }
                break;
              }
              prevTr = prevTr.previousElementSibling;
            }
          }
        });
      });

      updateModalNilaiCounters(currentLoadedSantri.length);

      const modalEl = document.getElementById('modalNilaiKBM');
      if (modalEl) {
        const myModal = bootstrap.Modal.getOrCreateInstance(modalEl);
        myModal.show();
        
        // Auto-fokus ke search bar setelah modal terbuka
        setTimeout(() => {
          if (inputModalSearchNilai) inputModalSearchNilai.focus();
        }, 400);
      }
    });
  }

  if (btnModalApplyAllNilai) {
    btnModalApplyAllNilai.addEventListener('click', () => {
      const val = document.getElementById('modal-nilai-default').value;
      if (val === '') {
        Swal.fire('Perhatian', 'Masukkan angka nilai (0-100) terlebih dahulu.', 'info');
        return;
      }
      
      const numVal = parseInt(val, 10);
      if (isNaN(numVal) || numVal < 0 || numVal > 100) {
        Swal.fire('Nilai Tidak Valid', 'Nilai harus berupa angka antara 0 hingga 100.', 'warning');
        return;
      }

      // Terapkan ke santri yang sedang tampak / terfilter
      let appliedCount = 0;
      modalNilaiTbody.querySelectorAll('tr.row-santri-nilai').forEach(tr => {
        if (tr.style.display !== 'none') {
          const inp = tr.querySelector('.input-modal-nilai');
          if (inp) {
            inp.value = numVal;
            appliedCount++;
          }
        }
      });

      updateModalNilaiCounters();

      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: `Nilai ${numVal} diterapkan ke ${appliedCount} santri`,
        showConfirmButton: false,
        timer: 1500
      });
    });
  }

  if (btnModalSaveNilai) {
    btnModalSaveNilai.addEventListener('click', () => {
      const tipe = document.getElementById('modal-nilai-tipe').value;
      const materi = document.getElementById('modal-nilai-materi').value.trim();

      kbmNilaiState.tipe_nilai = tipe;
      kbmNilaiState.materi = materi;
      kbmNilaiState.nilai_santri = {};

      let filledCount = 0;
      // Ambil seluruh input santri (baik yang tampak maupun yang sedang terfilter)
      modalNilaiTbody.querySelectorAll('.input-modal-nilai').forEach(inp => {
        const sId = inp.getAttribute('data-id');
        const cInp = modalNilaiTbody.querySelector(`.input-modal-catatan[data-id="${sId}"]`);
        const val = inp.value.trim();
        if (val !== '') filledCount++;
        kbmNilaiState.nilai_santri[sId] = {
          nilai: val,
          catatan: cInp ? cInp.value.trim() : ''
        };
      });

      const badge = document.getElementById('badge-nilai-status');
      if (badge) {
        if (filledCount > 0) {
          badge.className = 'badge bg-success text-white ms-1';
          badge.innerText = `${filledCount} Santri Dinilai`;
        } else {
          badge.className = 'badge bg-primary-subtle text-primary ms-1';
          badge.innerText = 'Opsional';
        }
      }

      const modalEl = document.getElementById('modalNilaiKBM');
      if (modalEl) {
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();
      }

      Swal.fire({
        title: 'Penilaian Disimpan',
        text: `${filledCount} santri telah diberikan nilai. Nilai akan otomatis dikirim saat Anda menekan Simpan KBM.`,
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
      });
    });
  }

  // Offline / Online Detection
  const statusIndicator = document.getElementById('online-status');
  function updateOnlineStatus() {
    if(navigator.onLine) {
      statusIndicator.className = 'status-indicator online shadow-sm';
      statusIndicator.innerHTML = '<i class="bi bi-wifi"></i>';
      statusIndicator.title = 'Status Koneksi: Online';
    } else {
      statusIndicator.className = 'status-indicator offline shadow-sm';
      statusIndicator.innerHTML = '<i class="bi bi-wifi-off"></i>';
      statusIndicator.title = 'Status Koneksi: Offline (Tersimpan Lokal)';
    }
  }
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus(); // Initial check

  // --- PIN Logic ---
  const validPin = "991588";
  let inputPin = "";
  let pinAttempts = 3;
  let pinModalInstance = null;
  let pinContext = 'save'; // 'save' or 'clock_in'

  const btnSaveAll = document.getElementById('btn-save-all');
  const btnCancelKbm = document.getElementById('btn-cancel-kbm');
  const pinDisplay = document.getElementById('pin-display');
  const pinError = document.getElementById('pin-error');
  const attemptsEl = document.getElementById('pin-attempts');
  const pinPadContainer = document.querySelector('.pin-pad');
  
  const btnJamMasuk = document.getElementById('btn-jam-masuk');
  const btnJamKeluar = document.getElementById('btn-jam-keluar');
  const clockActions = document.getElementById('clock-actions');

  // Initialize Modal
  const pinModalEl = document.getElementById('pinModal');
  if(pinModalEl) {
    pinModalInstance = new bootstrap.Modal(pinModalEl);
    
    // Generate Numpad
    const layout = [1,2,3,4,5,6,7,8,9,'C',0,'OK'];
    layout.forEach(key => {
      const col = document.createElement('div');
      col.className = 'col-4';
      const btn = document.createElement('button');
      btn.innerText = key;
      if (key === 'C') btn.classList.add('text-danger');
      if (key === 'OK') btn.classList.add('text-success');
      
      btn.addEventListener('click', () => handlePinClick(key));
      col.appendChild(btn);
      pinPadContainer.appendChild(col);
    });
  }

  if (btnJamMasuk) {
    btnJamMasuk.addEventListener('click', async () => {
      await doClockIn();
    });
  }

  if (btnJamKeluar) {
    btnJamKeluar.addEventListener('click', async () => {
       await doClockOut();
    });
  }

  if (btnCancelKbm) {
    btnCancelKbm.addEventListener('click', () => {
      Swal.fire({
        title: 'Batalkan Pengisian?',
        text: 'Data yang sudah Anda ketik akan hilang.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Ya, Batal',
        cancelButtonText: 'Tidak'
      }).then((result) => {
        if (result.isConfirmed) {
          resetFormComplete();
        }
      });
    });
  }

  btnSaveAll.addEventListener('click', () => {
    // Validate Jurnal Input before asking PIN
    const materi = document.getElementById('input-materi').value;
    if(!materi.trim()) {
      Swal.fire('Perhatian', 'Materi Pokok / Bahasan Topik wajib diisi!', 'warning');
      return;
    }
    
    // Reset PIN State
    pinContext = 'save';
    inputPin = "";
    updatePinDisplay();
    pinError.classList.add('d-none');
    
    pinModalInstance.show();
  });

  function handlePinClick(key) {
    pinError.classList.add('d-none');
    pinError.classList.remove('animate-shake');

    if (key === 'C') {
      inputPin = inputPin.slice(0, -1);
    } else if (key === 'OK') {
      processPinSubmit();
      return;
    } else {
      if(inputPin.length < 6) inputPin += key;
    }
    updatePinDisplay();
    
    // Auto submit if 6 digits
    if(inputPin.length === 6) {
      setTimeout(processPinSubmit, 200);
    }
  }

  function updatePinDisplay() {
    let display = "";
    for(let i=0; i<6; i++) {
      display += i < inputPin.length ? "•" : "-";
    }
    pinDisplay.innerText = display;
  }

  function processPinSubmit() {
    if(inputPin.length < 6) {
      showPinError("PIN harus 6 digit.");
      return;
    }

    if(inputPin === validPin) {
      // Success
      pinModalInstance.hide();
      if(pinContext === 'save') {
        saveData();
      } else if(pinContext === 'clock_in') {
        doClockIn();
      }
    } else {
      // Failed
      pinAttempts--;
      if(pinAttempts <= 0) {
        pinModalInstance.hide();
        Swal.fire('Akses Diblokir', 'Anda salah memasukkan PIN 3 kali. Form telah direset untuk keamanan.', 'error');
        resetFormComplete();
        pinAttempts = 3; // Reset counter for next time
      } else {
        inputPin = "";
        updatePinDisplay();
        showPinError(`PIN Salah! Kesempatan: ${pinAttempts}`);
      }
    }
  }

  function showPinError(msg) {
    pinError.innerHTML = msg;
    pinError.classList.remove('d-none');
    // trigger animation reflow
    void pinError.offsetWidth;
    pinError.classList.add('animate-shake');
  }

  async function saveData() {
    showLoading(true);
    
    // Here we collect the form data
    const isOffline = !navigator.onLine;

    // Collect Absensi Data & Nilai
    const absensiData = [];
    const tbody = document.getElementById('santri-tbody');
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(tr => {
      const radioChecked = tr.querySelector('input[type="radio"]:checked');
      const inputCatatan = tr.querySelector('td:last-child input');
      
      // Extract ID from radio name (format: abs_{id})
      const santriId = radioChecked ? radioChecked.name.replace('abs_', '') : '';
      const santriObj = currentLoadedSantri.find(s => String(s.id) === String(santriId));
      const sNama = santriObj ? santriObj.nama : '';

      // Check if there is grade in kbmNilaiState
      const nilaiObj = (kbmNilaiState.nilai_santri && kbmNilaiState.nilai_santri[santriId]) || {};
      
      absensiData.push({
        id_santri: santriId,
        nis: santriId,
        nama_santri: sNama,
        kehadiran: radioChecked ? radioChecked.value : 'Hadir',
        nilai: (nilaiObj.nilai !== undefined && nilaiObj.nilai !== null) ? nilaiObj.nilai : '',
        catatan: inputCatatan ? inputCatatan.value : (nilaiObj.catatan || '')
      });
    });

    const payload = {
      action: 'save_kbm',
      id_guru: selGuru.value,
      nama_guru: selGuru.options[selGuru.selectedIndex] ? selGuru.options[selGuru.selectedIndex].text : selGuru.value,
      id_mapel: selMapel.value,
      kelas: selKelas.value,
      jam: selJam.value,
      id_jadwal: selJam.options[selJam.selectedIndex] ? selJam.options[selJam.selectedIndex].getAttribute('data-id') : "",
      materi: document.getElementById('input-materi').value,
      catatan: document.getElementById('input-catatan').value,
      tipe_nilai: kbmNilaiState.tipe_nilai || 'Tugas',
      absensi: absensiData
    };

    if(isOffline) {
      showLoading(false);
      Swal.fire('Tersimpan Offline', 'Anda sedang offline. Data presensi dan jurnal disimpan secara lokal dan akan dikirim saat koneksi pulih.', 'info');
      resetFormComplete();
      pinAttempts = 3;
    } else {
      try {
        const response = await fetch(GAS_URL.replace("get_jadwal_kbm", "save_kbm"), {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        const res = await response.json();
        
        showLoading(false);
        if(res.success) {
          // Update id_jadwal and kelas into activeClockIn
          if(activeClockIn) {
            if(payload.id_jadwal) activeClockIn.id_jadwal = payload.id_jadwal;
            if(payload.kelas) activeClockIn.kelas = payload.kelas;
          }
          
          Swal.fire({
            title: 'Presensi Tercatat!',
            text: 'Data Presensi santri dan Jurnal KBM telah berhasil tersimpan. Sesi mengajar Anda tetap berjalan hingga Anda menekan tombol Jam Keluar saat KBM selesai.',
            icon: 'success',
            confirmButtonText: 'Selesai Input Presensi'
          }).then(() => {
            // Form presensi disembunyikan / direset tanpa mematikan sesi Jam Keluar!
            document.getElementById('content-area').classList.add('d-none');
            if (btnJamKeluar) btnJamKeluar.classList.remove('d-none');
            pinAttempts = 3;
          });
        } else {
          Swal.fire('Gagal', res.message || 'Terjadi kesalahan saat menyimpan.', 'error');
        }
      } catch (err) {
        showLoading(false);
        Swal.fire('Error', 'Gagal mengirim data ke server.', 'error');
        console.error(err);
      }
    }
  }

  async function doClockIn() {
    if (!selGuru.value) {
      Swal.fire('Perhatian', 'Silakan pilih Nama Guru terlebih dahulu.', 'warning');
      return;
    }
    
    showLoading(true);
    const namaGuru = selGuru.options[selGuru.selectedIndex] ? selGuru.options[selGuru.selectedIndex].text : selGuru.value;
    const idJadwal = (selJam && selJam.selectedIndex >= 0 && selJam.options[selJam.selectedIndex]) ? (selJam.options[selJam.selectedIndex].getAttribute('data-id') || '') : '';
    const idMapel = (selMapel && selMapel.value) ? selMapel.value : '';
    const kelas = (selKelas && selKelas.value) ? selKelas.value : '';

    const payload = {
      action: 'clock_in',
      id_guru: selGuru.value,
      nama_guru: namaGuru,
      id_jadwal: idJadwal,
      id_mapel: idMapel,
      kelas: kelas,
      timestamp: new Date().toISOString()
    };
    
    if(!navigator.onLine) {
      showLoading(false);
      Swal.fire('Tersimpan Offline', 'Jam Masuk disimpan lokal.', 'info');
      
      activeClockIn = {
        id_guru: payload.id_guru,
        nama_guru: payload.nama_guru,
        id_jadwal: idJadwal,
        kelas: kelas
      };
      onClockInSuccess();
    } else {
      try {
        const response = await fetch(GAS_URL.replace("get_jadwal_kbm", "clock_in"), {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        const res = await response.json();
        
        showLoading(false);
        if(res.success) {
          Swal.fire('Berhasil', 'Jam Masuk berhasil dicatat.', 'success');
          
          activeClockIn = {
            id_guru: payload.id_guru,
            nama_guru: payload.nama_guru,
            id_jadwal: idJadwal,
            kelas: kelas
          };
          onClockInSuccess();
        } else {
          Swal.fire('Gagal', res.message || 'Terjadi kesalahan.', 'error');
        }
      } catch (err) {
        showLoading(false);
        Swal.fire('Error', 'Gagal menghubungi server.', 'error');
        console.error(err);
      }
    }
  }

  function onClockInSuccess() {
     if(clockActions) clockActions.classList.add('d-none');
     if(btnJamKeluar) btnJamKeluar.classList.remove('d-none');
     selMapel.disabled = false;
     
     jamMasukTime = new Date();
     startProgressBar();
  }
  
  function startProgressBar() {
    const statusMengajar = document.getElementById('status-mengajar');
    const progressMengajar = document.getElementById('progress-mengajar');
    const sisaWaktuText = document.getElementById('sisa-waktu-text');
    const txtWaktuMasuk = document.getElementById('waktu-jam-masuk');
    
    if(!statusMengajar || !jamMasukTime) return;
    
    statusMengajar.classList.remove('d-none');
    
    const h = String(jamMasukTime.getHours()).padStart(2, '0');
    const m = String(jamMasukTime.getMinutes()).padStart(2, '0');
    txtWaktuMasuk.innerText = `${h}:${m}`;

    if (!selJam.value) {
      sisaWaktuText.innerText = "Pilih Jam Pelajaran";
      progressMengajar.style.width = "0%";
      return;
    }

    const timeRegex = /(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/;
    const match = selJam.value.match(timeRegex);
    
    if(!match) {
      sisaWaktuText.innerText = "Waktu tidak diketahui";
      progressMengajar.style.width = "100%";
      return;
    }
    
    const startTimeStr = match[1];
    const endTimeStr = match[2];
    
    const now = new Date();
    const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(startTimeStr.split(':')[0]), parseInt(startTimeStr.split(':')[1]), 0);
    const endTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(endTimeStr.split(':')[0]), parseInt(endTimeStr.split(':')[1]), 0);
    
    if(endTime < startTime) endTime.setDate(endTime.getDate() + 1);

    if(progressInterval) clearInterval(progressInterval);
    
    const updateProgress = () => {
      const currentTime = new Date();
      const totalDuration = endTime - startTime;
      const elapsed = currentTime - startTime;
      const remaining = endTime - currentTime;
      
      if(remaining <= 0) {
        sisaWaktuText.innerText = "Waktu Habis";
        progressMengajar.style.width = "100%";
        progressMengajar.classList.remove('bg-success');
        progressMengajar.classList.add('bg-danger');
        clearInterval(progressInterval);
      } else if (currentTime < startTime) {
        sisaWaktuText.innerText = "Belum Mulai";
        progressMengajar.style.width = "0%";
      } else {
        const remainingSeconds = Math.floor(remaining / 1000);
        const rm = Math.floor(remainingSeconds / 60);
        const rs = remainingSeconds % 60;
        
        let timeStr = "";
        if(rm > 0) timeStr += `${rm} menit `;
        timeStr += `${rs} detik lagi`;
        
        sisaWaktuText.innerText = timeStr;
        const percentage = (elapsed / totalDuration) * 100;
        progressMengajar.style.width = `${Math.min(100, Math.max(0, percentage))}%`;
        progressMengajar.classList.add('bg-success');
        progressMengajar.classList.remove('bg-danger');
      }
    };
    
    updateProgress();
    progressInterval = setInterval(updateProgress, 1000);
  }

  async function doClockOut() {
    showLoading(true);
    
    // Fallback if not stored in activeClockIn (e.g. page wasn't refreshed but state lost somehow)
    const fallbackNama = selGuru.options[selGuru.selectedIndex] ? selGuru.options[selGuru.selectedIndex].text : selGuru.value;
    const fallbackJadwal = selJam.options[selJam.selectedIndex] ? selJam.options[selJam.selectedIndex].getAttribute('data-id') : "";
    const fallbackKelas = selKelas.value || "";
    
    const payload = {
      action: 'clock_out',
      id_guru: activeClockIn ? activeClockIn.id_guru : selGuru.value,
      nama_guru: activeClockIn ? activeClockIn.nama_guru : fallbackNama,
      id_jadwal: (activeClockIn && activeClockIn.id_jadwal) ? activeClockIn.id_jadwal : fallbackJadwal,
      kelas: (activeClockIn && activeClockIn.kelas) ? activeClockIn.kelas : fallbackKelas,
      timestamp: new Date().toISOString()
    };
    
    if(!navigator.onLine) {
      showLoading(false);
      Swal.fire('Tersimpan Offline', 'Jam Keluar disimpan lokal.', 'info');
      if(btnJamKeluar) btnJamKeluar.classList.add('d-none');
    } else {
      try {
        const fetchUrl = GAS_URL.replace("get_jadwal_kbm", "clock_out");
        const response = await fetch(fetchUrl, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        const res = await response.json();
        
        showLoading(false);
        if(res.success) {
          Swal.fire('Berhasil', 'Jam Keluar berhasil dicatat.', 'success');
          if(btnJamKeluar) btnJamKeluar.classList.add('d-none');
          
          // Matikan progress bar
          const statusMengajar = document.getElementById('status-mengajar');
          if(statusMengajar) statusMengajar.classList.add('d-none');
          if(progressInterval) clearInterval(progressInterval);
          jamMasukTime = null;
          
        } else {
          Swal.fire('Gagal', res.message || 'Terjadi kesalahan.', 'error');
        }
      } catch (err) {
        showLoading(false);
        Swal.fire('Error', 'Gagal menghubungi server.', 'error');
        console.error(err);
      }
    }
  }

  function resetFormComplete() {
    document.getElementById('input-materi').value = '';
    document.getElementById('input-catatan').value = '';
    document.getElementById('content-area').classList.add('d-none');
    
    // Reset filters
    selMapel.selectedIndex = 0;
    selKelas.selectedIndex = 0;
    selJam.selectedIndex = 0;
    selMapel.disabled = true;
    selKelas.disabled = true;
    selJam.disabled = true;
    btnLoad.disabled = true;
    selGuru.selectedIndex = 0;
    
    clearSessionState();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Fullscreen Logic
  const btnFullscreen = document.getElementById('btn-fullscreen');
  if(btnFullscreen) {
    btnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.log(`Error attempting to enable fullscreen: ${err.message}`);
        });
        btnFullscreen.innerHTML = '<i class="bi bi-fullscreen-exit text-primary"></i>';
      } else {
        document.exitFullscreen();
        btnFullscreen.innerHTML = '<i class="bi bi-arrows-fullscreen text-secondary"></i>';
      }
    });
  }

  // --- Clock Logic ---
  const clockDisplay = document.getElementById('clock-display');
  function updateClock() {
    if(!clockDisplay) return;
    const now = new Date();
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    
    const dayName = days[now.getDay()];
    const date = String(now.getDate()).padStart(2, '0');
    const monthName = months[now.getMonth()];
    const year = now.getFullYear();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    
    // Format: hari, jam tanggal-bulan-tahun
    clockDisplay.innerText = `${dayName}, ${h}:${m}:${s} | ${date}-${monthName}-${year}`;
    
    // Update lock screen clock if visible
    const lockClockTime = document.getElementById('lock-clock-time');
    if (lockClockTime) {
      lockClockTime.innerText = `${h}:${m}:${s}`;
    }
  }
  setInterval(updateClock, 1000);
  updateClock();

  // ================================================================
  // KBM SESSION PERSISTENCE & LOCK SCREEN ENGINE
  // ================================================================
  const STORAGE_KEY = 'maisya_kbm_pwa_session_v1';
  const lockOverlay = document.getElementById('kbm-lock-overlay');
  const btnLockScreen = document.getElementById('btn-lock-screen');
  const btnUnlockKbm = document.getElementById('btn-unlock-kbm');

  function isLockScreenActive() {
    return lockOverlay && !lockOverlay.classList.contains('d-none');
  }

  function saveSessionState(isLocked) {
    try {
      const configSec = document.getElementById('config-section');
      const contentSec = document.getElementById('content-area');
      const logSec = document.getElementById('log-section');
      const dashboardSec = document.getElementById('dashboard-section');

      const isConfigVisible = configSec && !configSec.classList.contains('d-none');
      const isContentVisible = contentSec && !contentSec.classList.contains('d-none');
      const isLogVisible = logSec && !logSec.classList.contains('d-none');

      // Do not save if at empty dashboard
      if (!selGuru.value && !activeClockIn && !isContentVisible && !isConfigVisible) {
        return;
      }

      // Collect student checks
      const absensiDraft = {};
      const tbody = document.getElementById('santri-tbody');
      if (tbody) {
        const rows = tbody.querySelectorAll('tr');
        rows.forEach(tr => {
          const radioChecked = tr.querySelector('input[type="radio"]:checked');
          const inputCatatan = tr.querySelector('td:last-child input');
          const santriId = radioChecked ? radioChecked.name.replace('abs_', '') : '';
          if (santriId) {
            absensiDraft[santriId] = {
              status: radioChecked ? radioChecked.value : 'Hadir',
              catatan: inputCatatan ? inputCatatan.value : ''
            };
          }
        });
      }

      const state = {
        view: isContentVisible ? 'content' : (isConfigVisible ? 'config' : (isLogVisible ? 'log' : 'dashboard')),
        id_guru: selGuru ? selGuru.value : '',
        id_mapel: selMapel ? selMapel.value : '',
        kelas: selKelas ? selKelas.value : '',
        jam: selJam ? selJam.value : '',
        id_jadwal: (selJam && selJam.selectedIndex >= 0 && selJam.options[selJam.selectedIndex]) ? selJam.options[selJam.selectedIndex].getAttribute('data-id') : '',
        activeClockIn: activeClockIn || null,
        jamMasukTimeStr: jamMasukTime ? jamMasukTime.toISOString() : null,
        materi: document.getElementById('input-materi') ? document.getElementById('input-materi').value : '',
        catatan: document.getElementById('input-catatan') ? document.getElementById('input-catatan').value : '',
        absensiDraft: absensiDraft,
        kbmNilaiState: kbmNilaiState || null,
        isLocked: (typeof isLocked === 'boolean') ? isLocked : isLockScreenActive(),
        savedAt: new Date().toISOString()
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch(e) {
      console.warn("Gagal menyimpan state KBM:", e);
    }
  }

  function restoreSessionState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return false;
      const state = JSON.parse(saved);
      if (!state || !state.id_guru) return false;

      // Check if session is from today (prevent yesterday stale state)
      const savedDate = state.savedAt ? state.savedAt.split('T')[0] : '';
      const todayStr = new Date().toISOString().split('T')[0];
      if (savedDate && savedDate !== todayStr) {
        localStorage.removeItem(STORAGE_KEY);
        return false;
      }

      // Restore Guru dropdown
      if (selGuru) selGuru.value = state.id_guru;
      updateMapel();

      setTimeout(() => {
        if (state.id_mapel && selMapel) selMapel.value = state.id_mapel;
        updateKelas();

        setTimeout(() => {
          if (state.kelas && selKelas) selKelas.value = state.kelas;
          updateJam();

          setTimeout(() => {
            if (state.jam && selJam) {
              for (let i = 0; i < selJam.options.length; i++) {
                if (selJam.options[i].value === state.jam || selJam.options[i].value.includes(state.jam)) {
                  selJam.selectedIndex = i;
                  break;
                }
              }
            }

            if (selJam && selJam.value) btnLoad.disabled = false;

            // Restore Clock-In
            if (state.activeClockIn || state.jamMasukTimeStr) {
              activeClockIn = state.activeClockIn || { id_guru: state.id_guru, nama_guru: state.nama_guru || state.id_guru };
              if (state.jamMasukTimeStr) jamMasukTime = new Date(state.jamMasukTimeStr);
              if (clockActions) clockActions.classList.add('d-none');
              if (btnJamKeluar) btnJamKeluar.classList.remove('d-none');
              if (selMapel) selMapel.disabled = false;
              startProgressBar();
            }

            // Restore View & Sections
            if (state.view === 'config' || state.view === 'content') {
              const dashSec = document.getElementById('dashboard-section');
              const confSec = document.getElementById('config-section');
              const welc = document.getElementById('welcome-header');
              const mainNav = document.getElementById('main-nav-container');

              if (dashSec) dashSec.classList.add('d-none');
              if (confSec) confSec.classList.remove('d-none');
              if (welc) welc.classList.add('d-none');
              if (mainNav) mainNav.classList.add('d-none');
            }

            if (state.view === 'content') {
              // Trigger Santri Loading & Populate
              if (btnLoad) {
                btnLoad.click();
              }
              
              setTimeout(() => {
                const inpMateri = document.getElementById('input-materi');
                const inpCatatan = document.getElementById('input-catatan');
                if (inpMateri && state.materi) inpMateri.value = state.materi;
                if (inpCatatan && state.catatan) inpCatatan.value = state.catatan;
                if (state.kbmNilaiState) kbmNilaiState = state.kbmNilaiState;

                // Restore individual checks & notes
                if (state.absensiDraft) {
                  for (let sId in state.absensiDraft) {
                    const item = state.absensiDraft[sId];
                    const radio = document.querySelector(`input[name="abs_${sId}"][value="${item.status}"]`);
                    if (radio) radio.checked = true;
                    const inpNote = document.getElementById(`catatan_${sId}`);
                    if (inpNote && item.catatan) inpNote.value = item.catatan;
                  }
                }
              }, 1000);
            }

            if (state.isLocked) {
              showLockScreen(false);
            }
          }, 60);
        }, 60);
      }, 60);

      return true;
    } catch(e) {
      console.warn("Gagal me-restore state KBM:", e);
      return false;
    }
  }

  function clearSessionState() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch(e) {}
  }

  function showLockScreen(save = true) {
    if (!lockOverlay) return;
    
    // Populate session details into lock screen
    const guruNama = selGuru && selGuru.selectedIndex >= 0 && selGuru.options[selGuru.selectedIndex]
      ? selGuru.options[selGuru.selectedIndex].text 
      : (activeClockIn ? activeClockIn.nama_guru : '-');
    const mapelNama = selMapel && selMapel.selectedIndex >= 0 && selMapel.options[selMapel.selectedIndex]
      ? selMapel.options[selMapel.selectedIndex].text 
      : '-';
    const kelasNama = selKelas ? selKelas.value : '-';
    
    const lockInfoGuru = document.getElementById('lock-info-guru');
    const lockInfoMapel = document.getElementById('lock-info-mapel');
    const lockInfoStatus = document.getElementById('lock-info-status');
    const lockInfoProgress = document.getElementById('lock-info-progress');

    if (lockInfoGuru) lockInfoGuru.innerText = (guruNama && !guruNama.includes('--')) ? guruNama : 'Belum Dipilih';
    if (lockInfoMapel) lockInfoMapel.innerText = (mapelNama && !mapelNama.includes('--')) ? `${mapelNama} (${kelasNama || '-'})` : 'Belum Ada Sesi';
    
    if (lockInfoStatus) {
      if (activeClockIn || jamMasukTime) {
        lockInfoStatus.className = 'badge bg-success';
        lockInfoStatus.innerText = 'Jam Masuk Aktif';
      } else {
        lockInfoStatus.className = 'badge bg-secondary';
        lockInfoStatus.innerText = 'Belum Jam Masuk';
      }
    }

    if (lockInfoProgress) {
      const tbody = document.getElementById('santri-tbody');
      if (tbody) {
        const rows = tbody.querySelectorAll('tr');
        const checked = tbody.querySelectorAll('input[type="radio"]:checked').length;
        lockInfoProgress.innerText = rows.length > 0 ? `${checked} / ${rows.length} Santri` : '-';
      } else {
        lockInfoProgress.innerText = '-';
      }
    }

    lockOverlay.classList.remove('d-none');
    if (save) saveSessionState(true);
  }

  function hideLockScreen() {
    if (!lockOverlay) return;
    lockOverlay.classList.add('d-none');
    saveSessionState(false);
  }

  if (btnLockScreen) {
    btnLockScreen.addEventListener('click', () => showLockScreen(true));
  }
  if (btnUnlockKbm) {
    btnUnlockKbm.addEventListener('click', () => hideLockScreen());
  }

  // Hook auto-save on inputs
  const inpMateriEl = document.getElementById('input-materi');
  const inpCatatanEl = document.getElementById('input-catatan');
  if (inpMateriEl) inpMateriEl.addEventListener('input', () => saveSessionState());
  if (inpCatatanEl) inpCatatanEl.addEventListener('input', () => saveSessionState());
  if (selGuru) selGuru.addEventListener('change', () => saveSessionState());
  if (selMapel) selMapel.addEventListener('change', () => saveSessionState());
  if (selKelas) selKelas.addEventListener('change', () => saveSessionState());
  if (selJam) selJam.addEventListener('change', () => saveSessionState());

  // Listeners for page visibility & screen lock
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveSessionState(false);
    } else if (document.visibilityState === 'visible') {
      if (jamMasukTime) startProgressBar();
      updateClock();
    }
  });

  window.addEventListener('pagehide', () => saveSessionState(false));
  window.addEventListener('pageshow', () => {
    if (jamMasukTime) startProgressBar();
  });

  // Check and show install banner on start if not standalone & not dismissed
  setTimeout(() => {
    if (typeof updatePwaInstallVisibility === 'function') {
      updatePwaInstallVisibility();
    }
  }, 1000);

});

// ==================== PWA INSTALLATION MANAGER ====================
let deferredPwaPrompt = null;

// Deteksi komprehensif apakah aplikasi sudah terinstall di perangkat
function isAppAlreadyInstalled() {
  // 1. Display mode standalone / fullscreen / minimal-ui
  if (window.matchMedia && (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches
  )) {
    return true;
  }
  // 2. iOS Safari Web App standalone
  if (window.navigator && window.navigator.standalone === true) {
    return true;
  }
  // 3. Android TWA / WebAPK
  if (document.referrer && (document.referrer.includes('android-app://') || document.referrer.includes('app-installed'))) {
    return true;
  }
  // 4. LocalStorage flag yang disimpan saat event 'appinstalled' sukses
  if (localStorage.getItem('pwa_app_installed') === 'true') {
    return true;
  }
  return false;
}

// Fungsi sinkronisasi tampilan tombol install & banner
function updatePwaInstallVisibility() {
  const btnInstall = document.getElementById('btn-install-pwa');
  const banner = document.getElementById('pwa-install-banner');
  const isInstalled = isAppAlreadyInstalled();

  if (isInstalled) {
    // JIKA SUDAH TERINSTALL: tombol Install App dan Banner WAJIB DISEMBUNYIKAN
    if (btnInstall) btnInstall.classList.add('d-none');
    if (banner) banner.classList.add('d-none');
    console.log('[PWA] Perangkat terdeteksi SUDAH terpasang aplikasi. Tombol Install disembunyikan.');
  } else {
    // JIKA BELUM TERINSTALL: aktifkan dan tampilkan tombol Install App
    if (btnInstall) btnInstall.classList.remove('d-none');
    if (banner && !sessionStorage.getItem('pwa_banner_dismissed')) {
      banner.classList.remove('d-none');
    }
    console.log('[PWA] Perangkat terdeteksi BELUM memasang aplikasi. Tombol Install diaktifkan.');
  }
}

// Jalankan pengecekan deteksi segera
updatePwaInstallVisibility();

// Deteksi via Web API modern getInstalledRelatedApps (Chrome 80+)
if ('getInstalledRelatedApps' in navigator) {
  navigator.getInstalledRelatedApps().then(relatedApps => {
    if (relatedApps && relatedApps.length > 0) {
      console.log('[PWA] getInstalledRelatedApps mendeteksi aplikasi sudah terpasang:', relatedApps);
      localStorage.setItem('pwa_app_installed', 'true');
      updatePwaInstallVisibility();
    }
  }).catch(err => {
    console.warn('[PWA] getInstalledRelatedApps check error:', err);
  });
}

// Pantau perubahan mode tampilan (misal saat diluncurkan sebagai standalone)
if (window.matchMedia) {
  const standaloneMedia = window.matchMedia('(display-mode: standalone)');
  if (standaloneMedia.addEventListener) {
    standaloneMedia.addEventListener('change', (e) => {
      if (e.matches) {
        localStorage.setItem('pwa_app_installed', 'true');
        updatePwaInstallVisibility();
      }
    });
  }
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPwaPrompt = e;
  console.log('[PWA] beforeinstallprompt event captured successfully!');
  
  // Hanya tampilkan jika belum terinstall
  if (!isAppAlreadyInstalled()) {
    const btnInstall = document.getElementById('btn-install-pwa');
    if (btnInstall) btnInstall.classList.remove('d-none');
    const banner = document.getElementById('pwa-install-banner');
    if (banner && !sessionStorage.getItem('pwa_banner_dismissed')) {
      banner.classList.remove('d-none');
    }
  }
});

window.addEventListener('appinstalled', () => {
  console.log('[PWA] App successfully installed!');
  deferredPwaPrompt = null;
  localStorage.setItem('pwa_app_installed', 'true');
  
  // Otomatis sembunyikan tombol Install App dan Banner
  updatePwaInstallVisibility();

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: 'Aplikasi Berhasil Terpasang!',
      text: 'Presensi KBM kini telah terpasang di layar utama perangkat Anda.',
      icon: 'success',
      timer: 3000,
      showConfirmButton: false
    });
  }
});

window.triggerPwaInstall = async function() {
  if (isAppAlreadyInstalled()) {
    updatePwaInstallVisibility();
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        title: 'Aplikasi Sudah Terpasang',
        text: 'Presensi KBM sudah terpasang pada perangkat Anda.',
        icon: 'info',
        confirmButtonText: 'OK'
      });
    } else {
      alert('Aplikasi sudah terpasang di perangkat Anda.');
    }
    return;
  }

  if (deferredPwaPrompt) {
    try {
      deferredPwaPrompt.prompt();
      const choiceResult = await deferredPwaPrompt.userChoice;
      console.log('[PWA] User choice outcome:', choiceResult.outcome);
      if (choiceResult.outcome === 'accepted') {
        deferredPwaPrompt = null;
        localStorage.setItem('pwa_app_installed', 'true');
        updatePwaInstallVisibility();
      }
    } catch(err) {
      console.warn('[PWA] Native prompt error, showing guide modal:', err);
      openPwaInstallGuideModal();
    }
  } else {
    // Fallback: show interactive modal guide for browser without native prompt
    openPwaInstallGuideModal();
  }
};

window.tryNativeInstallPrompt = async function() {
  if (deferredPwaPrompt) {
    try {
      deferredPwaPrompt.prompt();
      const choiceResult = await deferredPwaPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        deferredPwaPrompt = null;
        const modalEl = document.getElementById('modalPwaInstallGuide');
        if (modalEl) {
          const bsModal = bootstrap.Modal.getInstance(modalEl);
          if (bsModal) bsModal.hide();
        }
      }
    } catch(e) {
      console.error(e);
    }
  } else {
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        title: 'Browser Tidak Mendukung Pemasangan Otomatis',
        text: 'Silakan ikuti 3 langkah manual di atas sesuai browser/perangkat yang Anda gunakan.',
        icon: 'info',
        confirmButtonText: 'Saya Mengerti'
      });
    } else {
      alert('Silakan ikuti petunjuk manual di atas untuk browser Anda.');
    }
  }
};

window.dismissPwaBanner = function() {
  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.classList.add('d-none');
  sessionStorage.setItem('pwa_banner_dismissed', 'true');
};

function detectPwaPlatform() {
  const ua = navigator.userAgent || navigator.vendor || window.opera || '';
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
    return 'ios';
  } else if (/Android/.test(ua)) {
    return 'android';
  }
  return 'desktop';
}

window.openPwaInstallGuideModal = function() {
  const modalEl = document.getElementById('modalPwaInstallGuide');
  if (!modalEl) return;
  
  const platform = detectPwaPlatform();
  
  // Activate platform tab
  const tabAndroid = document.getElementById('tab-pwa-android');
  const tabIos = document.getElementById('tab-pwa-ios');
  const tabDesktop = document.getElementById('tab-pwa-desktop');
  const paneAndroid = document.getElementById('pane-pwa-android');
  const paneIos = document.getElementById('pane-pwa-ios');
  const paneDesktop = document.getElementById('pane-pwa-desktop');
  
  [tabAndroid, tabIos, tabDesktop].forEach(t => { if(t) t.classList.remove('active'); });
  [paneAndroid, paneIos, paneDesktop].forEach(p => { if(p) p.classList.remove('show', 'active'); });
  
  if (platform === 'ios') {
    if (tabIos) tabIos.classList.add('active');
    if (paneIos) paneIos.classList.add('show', 'active');
  } else if (platform === 'android') {
    if (tabAndroid) tabAndroid.classList.add('active');
    if (paneAndroid) paneAndroid.classList.add('show', 'active');
  } else {
    if (tabDesktop) tabDesktop.classList.add('active');
    if (paneDesktop) paneDesktop.classList.add('show', 'active');
  }
  
  const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
  bsModal.show();
};

// Check if opened inside In-App Browser (WhatsApp, Telegram, Line, FB, IG Webview)
function isInAppBrowser() {
  const ua = navigator.userAgent || navigator.vendor || window.opera || '';
  return (ua.indexOf('FBAN') > -1) || 
         (ua.indexOf('FBAV') > -1) || 
         (ua.indexOf('Instagram') > -1) || 
         (ua.indexOf('Line') > -1) || 
         (ua.indexOf('WhatsApp') > -1) ||
         (ua.indexOf('Telegram') > -1) ||
         (ua.indexOf('MicroMessenger') > -1);
}

document.addEventListener('DOMContentLoaded', () => {
  if (isInAppBrowser() && !sessionStorage.getItem('inapp_warned')) {
    setTimeout(() => {
      sessionStorage.setItem('inapp_warned', '1');
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          title: 'Buka di Browser Utama',
          html: 'Anda sedang membuka Presensi KBM melalui browser internal chat.<br><br>Untuk pengalaman terbaik & menyimpan ke layar utama HP, silakan ketuk menu titik tiga (<b>⋮</b>) di pojok kanan atas lalu pilih <b>"Buka di Browser / Chrome / Safari"</b>.',
          icon: 'info',
          confirmButtonText: 'Baik, Saya Mengerti'
        });
      }
    }, 1500);
  }
});

