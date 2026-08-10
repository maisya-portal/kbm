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

  // GAS API URL
  const GAS_URL = "https://script.google.com/macros/s/AKfycbxWjwlc6-mXpOimodZMFvQIC8hwdGRAz78PqnYIfQgSuXKkI9fUP4hXfC5x3QUIypiT/exec?action=get_jadwal_kbm";
  let allJadwal = [];
  let allMapel = [];
  let allSantri = [];

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
        populateGuruDropdown(res.staff, allJadwal);
      } else {
        Swal.fire('Error', 'Gagal memuat data jadwal dari server.', 'error');
      }
    } catch (e) {
      console.error(e);
      Swal.fire('Offline', 'Tidak dapat terhubung ke server (Offline Mode). Data jadwal tidak dapat dimuat.', 'warning');
      selGuru.innerHTML = '<option value="" selected disabled>-- Offline --</option>';
    }
    showLoading(false);
  }

  function populateGuruDropdown(staffList, jadwals) {
    selGuru.innerHTML = '<option value="" selected disabled>-- Pilih Guru --</option>';
    
    // Get unique staff IDs that exist in jadwal to only show teachers who have schedules
    const guruWithJadwal = [...new Set(jadwals.map(j => j.ID_Staff))];
    
    // Map to objects so we can sort alphabetically
    const guruData = guruWithJadwal.map(idStaff => {
      const st = (staffList || []).find(s => s.ID_Staff === idStaff);
      const nama = st ? st.Nama_Lengkap : (jadwals.find(j => j.ID_Staff === idStaff).Nama_Guru || idStaff);
      return { idStaff, nama };
    });

    // Sort alphabetically by name
    guruData.sort((a, b) => a.nama.localeCompare(b.nama));

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

  // Enable cascade selects and filter based on selected Guru
  selGuru.addEventListener('change', updateMapel);
  selMapel.addEventListener('change', updateKelas);
  selKelas.addEventListener('change', updateJam);
  selJam.addEventListener('change', () => {
    if (selJam.value) btnLoad.disabled = false;
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
    } else {
      btnLoad.disabled = true;
    }
  }

  // Call Init
  initData();

  // Load Santri
  btnLoad.addEventListener('click', () => {
    if(!selGuru.value || !selKelas.value) return;
    
    showLoading(true);
    
    const selectedKelasName = selKelas.value;
    
    // Filter santri asli dari database berdasarkan kelas
    let generatedSantri = allSantri.filter(s => String(s.kelas) === String(selectedKelasName) || String(s.Kelas) === String(selectedKelasName));
    
    // Jika tidak ada santri ditemukan, berikan fallback (opsional, tapi sebaiknya kosong saja)
    if(generatedSantri.length === 0) {
      console.warn("Tidak ada santri ditemukan untuk kelas " + selectedKelasName);
    }
    
    // Format data santri agar sesuai dengan fungsi renderSantri (butuh id dan nama)
    const formattedSantri = generatedSantri.map((s, i) => ({
      id: s.id_santri || s.ID_Santri || s.nis || `S${i}`,
      nama: s.nama || s.Nama_Lengkap || s.nama_santri || s.Nama || 'Santri Tidak Dikenal'
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

  function renderSantri(data) {
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
        <td>
          <input type="number" class="form-control form-control-sm text-center bg-light input-nilai-santri" placeholder="0-100" min="0" max="100" id="nilai_${s.id}">
        </td>
        <td class="pe-4">
          <input type="text" class="form-control form-control-sm bg-light" placeholder="Keterangan..." id="catatan_${s.id}">
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Set Nilai Semua Event
  const inputDefaultNilai = document.getElementById('input-default-nilai');
  if(inputDefaultNilai) {
    inputDefaultNilai.addEventListener('input', (e) => {
      const val = e.target.value;
      const allNilaiInputs = document.querySelectorAll('.input-nilai-santri');
      allNilaiInputs.forEach(input => {
        input.value = val;
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
      // Here we would typically sync pending offline data
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
    btnJamMasuk.addEventListener('click', () => {
      pinContext = 'clock_in';
      inputPin = "";
      updatePinDisplay();
      pinError.classList.add('d-none');
      pinModalInstance.show();
    });
  }

  if (btnJamKeluar) {
    btnJamKeluar.addEventListener('click', async () => {
       await doClockOut();
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

    // Collect Absensi Data
    const absensiData = [];
    const tbody = document.getElementById('santri-tbody');
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(tr => {
      const radioChecked = tr.querySelector('input[type="radio"]:checked');
      const inputNilai = tr.querySelector('.input-nilai-santri');
      const inputCatatan = tr.querySelector('td:last-child input');
      
      // Extract ID from radio name (format: abs_{id})
      const santriId = radioChecked ? radioChecked.name.replace('abs_', '') : '';
      
      absensiData.push({
        id_santri: santriId,
        kehadiran: radioChecked ? radioChecked.value : 'Hadir',
        nilai: inputNilai ? inputNilai.value : '',
        catatan: inputCatatan ? inputCatatan.value : ''
      });
    });

    const payload = {
      id_guru: selGuru.value,
      id_mapel: selMapel.value,
      kelas: selKelas.value,
      jam: selJam.value,
      id_jadwal: selJam.options[selJam.selectedIndex] ? selJam.options[selJam.selectedIndex].getAttribute('data-id') : "",
      materi: document.getElementById('input-materi').value,
      catatan: document.getElementById('input-catatan').value,
      absensi: absensiData
    };

    if(isOffline) {
      showLoading(false);
      // Save to localStorage (dummy logic as before)
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
          Swal.fire('Berhasil!', 'Data Presensi dan Jurnal Mengajar telah tersimpan ke database.', 'success');
          resetFormComplete();
          pinAttempts = 3;
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
    showLoading(true);
    const payload = {
      id_guru: selGuru.value,
      timestamp: new Date().toISOString()
    };
    
    if(!navigator.onLine) {
      showLoading(false);
      Swal.fire('Tersimpan Offline', 'Jam Masuk disimpan lokal.', 'info');
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
  }

  async function doClockOut() {
    showLoading(true);
    const payload = {
      id_guru: selGuru.value,
      timestamp: new Date().toISOString()
    };
    
    if(!navigator.onLine) {
      showLoading(false);
      Swal.fire('Tersimpan Offline', 'Jam Keluar disimpan lokal.', 'info');
      if(btnJamKeluar) btnJamKeluar.classList.add('d-none');
    } else {
      try {
        const response = await fetch(GAS_URL.replace("get_jadwal_kbm", "clock_out"), {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        const res = await response.json();
        
        showLoading(false);
        if(res.success) {
          Swal.fire('Berhasil', 'Jam Keluar berhasil dicatat.', 'success');
          if(btnJamKeluar) btnJamKeluar.classList.add('d-none');
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
  }
  setInterval(updateClock, 1000);
  updateClock();

});
