/**
 * KBM Firebase Cloud Adapter
 * Replaces slow Google Apps Script (GAS) backend with 100% Realtime Firebase Database.
 * Target RTDB: https://maisya-pengajaran-db-default-rtdb.asia-southeast1.firebasedatabase.app
 */

(function(window) {
  'use strict';

  const RTDB_BASE = 'https://maisya-pengajaran-db-default-rtdb.asia-southeast1.firebasedatabase.app/tables';

  // Helper for REST requests to RTDB
  async function rtdbGet(path) {
    const res = await fetch(`${RTDB_BASE}/${path}.json`);
    if (!res.ok) throw new Error(`RTDB GET ${path} failed: ${res.statusText}`);
    return await res.json();
  }

  async function rtdbPut(path, data) {
    const res = await fetch(`${RTDB_BASE}/${path}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`RTDB PUT ${path} failed: ${res.statusText}`);
    return await res.json();
  }

  async function rtdbPatch(path, data) {
    const res = await fetch(`${RTDB_BASE}/${path}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`RTDB PATCH ${path} failed: ${res.statusText}`);
    return await res.json();
  }

  function toArray(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val.filter(Boolean);
    if (typeof val === 'object') {
      return Object.entries(val).map(([k, v]) => {
        if (v && typeof v === 'object' && !v.__fbKey) v.__fbKey = k;
        return v;
      }).filter(Boolean);
    }
    return [];
  }

  function getIndoDayName(date) {
    const days = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    return days[date.getDay()];
  }

  function getTodayDateStr() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function getCurrentTimeStr() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  const KBMFirebase = {
    // 1. Get Master Data (Jadwal, Mapel, Santri, Staff, Active Jadwal)
    async getJadwalKBM() {
      try {
        console.log('[KBM Firebase] Fetching master data from RTDB...');
        const [rawJadwal, rawMapel, rawSantri, rawStaff, rawLogs] = await Promise.all([
          rtdbGet('Tbl_Jadwal').catch(() => ({})),
          rtdbGet('Tbl_Kurikulum').catch(() => ({})),
          rtdbGet('tb_santri').catch(() => ({})),
          rtdbGet('Tbl_Staff').catch(() => ({})),
          rtdbGet('Tbl_KBM_Logs').catch(() => ({}))
        ]);

        const jadwal = toArray(rawJadwal).map(j => ({
          ID_Jadwal: j.ID_Jadwal || j.__fbKey || '',
          Hari: j.Hari || '',
          Jam_Mulai: j.Jam_Mulai || '',
          Jam_Selesai: j.Jam_Selesai || '',
          Kelas: j.Kelas || '',
          ID_Mapel: j.ID_Mapel || '',
          ID_Staff: j.ID_Staff || '',
          Tahun_Ajaran: j.Tahun_Ajaran || '2026/2027'
        }));

        const mapel = toArray(rawMapel).map(m => ({
          ID_Mapel: m.ID_Mapel || m.__fbKey || '',
          Kode_Mapel: m.Kode_Mapel || '',
          Nama_Mapel: m.Nama_Mapel || '',
          Kategori: m.Kategori || 'Umum',
          Tingkat: m.Tingkat || 'Umum',
          KKM: m.KKM || 75,
          Tahun_Ajaran: m.Tahun_Ajaran || '2026/2027',
          AI_ProtaPromes: m.AI_ProtaPromes || ''
        }));

        const santri = toArray(rawSantri).map(s => ({
          ID_Santri: s.ID_Santri || s.nis || s.NIS || s.__fbKey || '',
          NIS: s.NIS || s.nis || s.ID_Santri || '',
          Nama: s.Nama || s.nama || s.Nama_Santri || s.Nama_Lengkap || '',
          Kelas: s.Kelas || s.kelas || '',
          ID_Kamar: s.ID_Kamar || '',
          Tahun_Masuk: s.Tahun_Masuk || '',
          Status_Aktif: s.Status_Aktif || s.status_aktif || 'Aktif',
          No_WA: s['No WA'] || s.no_wa || s.No_HP_Wali || '',
          UID_Card: s.UID_Card || s.uid_card || ''
        }));

        const staff = toArray(rawStaff).map(st => ({
          ID_Staff: st.ID_Staff || st.__fbKey || '',
          Username: st.Username || st.username || '',
          Password: st.Password || '',
          Nama_Lengkap: st.Nama_Lengkap || st.nama_lengkap || '',
          Role: st.Role || st.role || 'ROLE-USTADZ',
          WA_Phone: st.WA_Phone || st.wa_phone || '',
          Tahun_Aktif: st.Tahun_Aktif || '2026/2027',
          Kode_Guru: st.Kode_Guru || '',
          Status_Aktif: st.Status_Aktif || 'Aktif'
        }));

        const todayStr = getTodayDateStr();
        const logs = toArray(rawLogs);
        const activeJadwal = logs
          .filter(l => l.tanggal === todayStr && l.status_guru === 'Hadir')
          .map(l => l.id_jadwal)
          .filter(Boolean);

        console.log(`[KBM Firebase] Master data loaded: ${jadwal.length} Jadwal, ${mapel.length} Mapel, ${santri.length} Santri, ${staff.length} Staff.`);
        return {
          success: true,
          jadwal,
          mapel,
          santri,
          staff,
          active_jadwal: activeJadwal
        };
      } catch (err) {
        console.error('[KBM Firebase] Error fetching master data:', err);
        return { success: false, message: err.message };
      }
    },

    // 2. Clock In
    async clockIn(payload) {
      try {
        console.log('[KBM Firebase] Clock In:', payload);
        const todayStr = getTodayDateStr();
        const timeNow = getCurrentTimeStr();
        const clockId = 'CLK-' + Date.now();

        const record = {
          ID_Kehadiran: clockId,
          ID_Staff: payload.id_guru || '',
          Nama_Guru: payload.nama_guru || '',
          ID_Jadwal: payload.id_jadwal || '',
          ID_Mapel: payload.id_mapel || '',
          Kelas: payload.kelas || '',
          Tanggal: todayStr,
          Jam_Masuk: timeNow,
          Jam_Keluar: '',
          Status: 'Mengajar',
          Timestamp: payload.timestamp || new Date().toISOString()
        };

        // Write to Tbl_KehadiranGuru
        await rtdbPut(`Tbl_KehadiranGuru/${clockId}`, record);

        return { success: true, message: 'Jam Masuk berhasil dicatat di Firebase Cloud!', clockId };
      } catch (err) {
        console.error('[KBM Firebase] Error during clock in:', err);
        return { success: false, message: err.message };
      }
    },

    // 3. Clock Out
    async clockOut(payload) {
      try {
        console.log('[KBM Firebase] Clock Out:', payload);
        const todayStr = getTodayDateStr();
        const timeNow = getCurrentTimeStr();

        // Update active kehadiran in Tbl_KehadiranGuru
        const rawKehadiran = await rtdbGet('Tbl_KehadiranGuru').catch(() => ({}));
        const items = toArray(rawKehadiran);
        const activeItem = items.reverse().find(k => 
          (k.ID_Staff === payload.id_guru || k.Nama_Guru === payload.nama_guru) &&
          k.Tanggal === todayStr &&
          (!k.Jam_Keluar || k.Jam_Keluar === '' || k.Status === 'Mengajar')
        );

        if (activeItem) {
          const key = activeItem.ID_Kehadiran || activeItem.__fbKey;
          await rtdbPatch(`Tbl_KehadiranGuru/${key}`, {
            Jam_Keluar: timeNow,
            Status: 'Selesai'
          });
        }

        return { success: true, message: 'Jam Keluar berhasil dicatat di Firebase Cloud!' };
      } catch (err) {
        console.error('[KBM Firebase] Error during clock out:', err);
        return { success: false, message: err.message };
      }
    },

    // 4. Save KBM (Presensi Santri + Jurnal Mengajar)
    async saveKBM(payload) {
      try {
        console.log('[KBM Firebase] Saving KBM Presensi & Jurnal...', payload);
        const todayStr = getTodayDateStr();
        const timeNow = getCurrentTimeStr();
        const idJurnal = 'JRN-' + Date.now();
        const dayName = getIndoDayName(new Date());

        const absensiList = payload.absensi || [];
        let hadir = 0, sakit = 0, izin = 0, alfa = 0;
        const catatanSantri = [];

        absensiList.forEach(a => {
          const st = String(a.kehadiran || 'Hadir').trim();
          if (st === 'Hadir') hadir++;
          else if (st === 'Sakit') sakit++;
          else if (st === 'Izin') izin++;
          else if (st === 'Alfa') alfa++;

          catatanSantri.push({
            id_santri: a.id_santri || a.nis || '',
            nis: a.nis || a.id_santri || '',
            nama: a.nama_santri || '',
            status: st,
            nilai: (a.nilai !== undefined && a.nilai !== null) ? a.nilai : '',
            catatan: a.catatan || ''
          });
        });

        // Resolve Mapel Name
        let namaMapel = payload.id_mapel || '';
        try {
          const rawKurikulum = await rtdbGet('Tbl_Kurikulum').catch(() => ({}));
          const listM = toArray(rawKurikulum);
          const found = listM.find(m => m.ID_Mapel === payload.id_mapel || m.__fbKey === payload.id_mapel);
          if (found && found.Nama_Mapel) namaMapel = found.Nama_Mapel;
        } catch(e) {}

        // Schedule times
        let scheduledMasuk = timeNow;
        let scheduledKeluar = '';
        if (payload.jam && String(payload.jam).includes('-')) {
          const parts = payload.jam.split('-');
          scheduledMasuk = parts[0].trim();
          scheduledKeluar = parts[1].trim();
        }

        // 1. Tbl_KBM_Logs record
        const logRecord = {
          id_jurnal: idJurnal,
          id_jadwal: payload.id_jadwal || '',
          id_guru: payload.id_guru || '',
          guru: payload.nama_guru || '',
          id_mapel: payload.id_mapel || '',
          pelajaran: namaMapel,
          kelas: payload.kelas || '',
          tanggal: todayStr,
          hari: dayName,
          waktu: timeNow,
          jam_ke: payload.jam || timeNow,
          scheduled_masuk: scheduledMasuk,
          scheduled_keluar: scheduledKeluar,
          materi: payload.materi || '',
          catatan_kelas: payload.catatan || '',
          hadir: hadir,
          sakit: sakit,
          izin: izin,
          alfa: alfa,
          status_guru: 'Hadir',
          status_isi: true,
          tipe_nilai: payload.tipe_nilai || 'Tugas',
          catatan_santri: catatanSantri,
          late_mins: 0,
          over_mins: 0,
          no: Date.now()
        };

        // 2. Tbl_JurnalMengajar record
        const jurnalRecord = {
          ID_Jurnal: idJurnal,
          Tanggal: todayStr,
          Hari: dayName,
          ID_Staff: payload.id_guru || '',
          Nama_Guru: payload.nama_guru || '',
          ID_Mapel: payload.id_mapel || '',
          Nama_Mapel: namaMapel,
          Kelas: payload.kelas || '',
          Jam_Pelajaran: payload.jam || timeNow,
          Materi: payload.materi || '',
          Catatan_KBM: payload.catatan || '',
          Jumlah_Hadir: hadir,
          Jumlah_Sakit: sakit,
          Jumlah_Izin: izin,
          Jumlah_Alfa: alfa,
          Timestamp: new Date().toISOString()
        };

        // Save in parallel to RTDB
        const promises = [
          rtdbPut(`Tbl_KBM_Logs/${idJurnal}`, logRecord),
          rtdbPut(`Tbl_JurnalMengajar/${idJurnal}`, jurnalRecord)
        ];

        // Save individual student attendance to Tbl_AbsensiKelas
        absensiList.forEach(a => {
          const sId = a.id_santri || a.nis || 'unknown';
          const absKey = `ABS-${idJurnal}-${sId}`.replace(/[.#$[\]]/g, '_');
          const absRecord = {
            ID_Absen: absKey,
            ID_Jurnal: idJurnal,
            Tanggal: todayStr,
            Kelas: payload.kelas || '',
            ID_Santri: sId,
            NIS: a.nis || sId,
            Nama_Santri: a.nama_santri || '',
            Status_Kehadiran: a.kehadiran || 'Hadir',
            Nilai_Harian: a.nilai || '',
            Catatan_Santri: a.catatan || ''
          };
          promises.push(rtdbPut(`Tbl_AbsensiKelas/${absKey}`, absRecord));
        });

        await Promise.all(promises);
        console.log(`[KBM Firebase] KBM session ${idJurnal} saved successfully!`);

        return {
          success: true,
          message: 'Presensi santri dan Jurnal KBM telah berhasil tersimpan ke Firebase Cloud!',
          id_jurnal: idJurnal
        };
      } catch (err) {
        console.error('[KBM Firebase] Error saving KBM:', err);
        return { success: false, message: err.message };
      }
    },

    // 5. Get Log KBM
    async getLogKBM(filter) {
      try {
        console.log('[KBM Firebase] Getting KBM logs, filter:', filter);
        const rawLogs = await rtdbGet('Tbl_KBM_Logs').catch(() => ({}));
        let list = toArray(rawLogs);

        const startDate = filter ? (filter.startDate || filter.tanggal || '') : '';
        const endDate = filter ? (filter.endDate || filter.startDate || filter.tanggal || '') : '';

        if (startDate) {
          list = list.filter(l => {
            if (!l.tanggal) return false;
            if (endDate) {
              return l.tanggal >= startDate && l.tanggal <= endDate;
            }
            return l.tanggal === startDate;
          });
        }

        // Sort descending by date & time
        list.sort((a, b) => {
          const dtA = (a.tanggal || '') + ' ' + (a.waktu || '00:00');
          const dtB = (b.tanggal || '') + ' ' + (b.waktu || '00:00');
          return dtB.localeCompare(dtA);
        });

        console.log(`[KBM Firebase] Returning ${list.length} KBM logs.`);
        return { success: true, data: list };
      } catch (err) {
        console.error('[KBM Firebase] Error getting KBM logs:', err);
        return { success: false, message: err.message, data: [] };
      }
    },

    // 6. Update Log KBM
    async updateLogKBM(payload) {
      try {
        console.log('[KBM Firebase] Updating KBM log:', payload);
        const idJurnal = payload.id_jurnal || payload.id_jadwal;
        if (!idJurnal) throw new Error('ID Jurnal tidak valid');

        const absensiList = payload.absensi || [];
        let hadir = 0, sakit = 0, izin = 0, alfa = 0;
        const catatanSantri = [];

        absensiList.forEach(a => {
          const st = String(a.status || a.kehadiran || 'Hadir').trim();
          if (st === 'Hadir') hadir++;
          else if (st === 'Sakit') sakit++;
          else if (st === 'Izin') izin++;
          else if (st === 'Alfa') alfa++;

          catatanSantri.push({
            id_santri: a.id_santri || a.nis || '',
            nis: a.nis || a.id_santri || '',
            nama: a.nama || a.nama_santri || '',
            status: st,
            nilai: (a.nilai !== undefined && a.nilai !== null) ? a.nilai : '',
            catatan: a.catatan || ''
          });
        });

        const patchData = {
          materi: payload.materi || '',
          catatan_kelas: payload.catatan || '',
          waktu: payload.jam_masuk || '',
          jam_ke: payload.jam_keluar || '',
          hadir: hadir,
          sakit: sakit,
          izin: izin,
          alfa: alfa,
          catatan_santri: catatanSantri,
          status_isi: true
        };

        // Update in Tbl_KBM_Logs
        await rtdbPatch(`Tbl_KBM_Logs/${idJurnal}`, patchData);

        // Also update Tbl_JurnalMengajar if exists
        await rtdbPatch(`Tbl_JurnalMengajar/${idJurnal}`, {
          Materi: payload.materi || '',
          Catatan_KBM: payload.catatan || '',
          Jumlah_Hadir: hadir,
          Jumlah_Sakit: sakit,
          Jumlah_Izin: izin,
          Jumlah_Alfa: alfa
        }).catch(() => {});

        return { success: true, message: 'Log Presensi & Jurnal KBM berhasil diperbarui di Firebase Cloud!' };
      } catch (err) {
        console.error('[KBM Firebase] Error updating KBM log:', err);
        return { success: false, message: err.message };
      }
    }
  };

  // Expose KBMFirebase globally
  window.KBMFirebase = KBMFirebase;

  // Intercept window.fetch so existing code in app.js seamlessly switches to Firebase RTDB!
  const originalFetch = window.fetch;
  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');

    // Check if this is a request to Google Apps Script (GAS) KBM backend
    if (url.includes('script.google.com') || url.includes('action=get_jadwal_kbm') || url.includes('action=get_log_kbm') || url.includes('action=save_kbm') || url.includes('action=clock_in') || url.includes('action=clock_out') || url.includes('action=update_log_kbm')) {
      let action = '';
      let bodyData = null;

      // Extract action from URL query
      if (url.includes('action=')) {
        const match = url.match(/action=([a-zA-Z0-9_]+)/);
        if (match) action = match[1];
      }

      // Or parse body if POST
      if (init && init.body) {
        try {
          bodyData = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
          if (bodyData && bodyData.action) action = bodyData.action;
        } catch(e) {}
      }

      console.log(`[KBM Firebase Interceptor] Intercepted GAS action: ${action}`);

      let result = null;
      if (action === 'get_jadwal_kbm') {
        result = await KBMFirebase.getJadwalKBM();
      } else if (action === 'clock_in') {
        result = await KBMFirebase.clockIn(bodyData || {});
      } else if (action === 'clock_out') {
        result = await KBMFirebase.clockOut(bodyData || {});
      } else if (action === 'save_kbm') {
        result = await KBMFirebase.saveKBM(bodyData || {});
      } else if (action === 'get_log_kbm') {
        result = await KBMFirebase.getLogKBM(bodyData || {});
      } else if (action === 'update_log_kbm') {
        result = await KBMFirebase.updateLogKBM(bodyData || {});
      } else {
        // Fallback to original fetch
        return originalFetch.apply(this, arguments);
      }

      // Return synthetic Response object mimicking a real network response
      return new Response(JSON.stringify(result), {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'application/json',
          'X-Powered-By': 'Firebase-RTDB-Maisya-Cloud'
        }
      });
    }

    // Default passthrough for all other URLs
    return originalFetch.apply(this, arguments);
  };

  console.log('[KBM Firebase] Adapter initialized and window.fetch hooked to Firebase Cloud RTDB.');
})(window);
