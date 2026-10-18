//! Sidecars must not outlive the app. Windows closes the job handle when the process exits,
//! crash included, and KILL_ON_JOB_CLOSE then ends every process still assigned to the job.

#[cfg(windows)]
mod platform {
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;
    use std::sync::OnceLock;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{CloseHandle, DuplicateHandle, DUPLICATE_SAME_ACCESS, HANDLE};
    use windows::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows::Win32::System::Threading::{
        GetCurrentProcess, OpenProcess, TerminateProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE,
    };

    pub(super) struct Job(pub(super) HANDLE);
    // SAFETY: a job handle is a kernel object reference that any thread may use.
    unsafe impl Send for Job {}
    unsafe impl Sync for Job {}

    pub(super) fn kill_on_close_job() -> Option<Job> {
        // SAFETY: the limit structure is fully initialized and passed with its exact size.
        unsafe {
            let handle = CreateJobObjectW(None, PCWSTR::null()).ok()?;
            let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let configured = SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                std::ptr::from_ref(&limits).cast(),
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            if configured.is_err() {
                let _ = CloseHandle(handle);
                return None;
            }
            Some(Job(handle))
        }
    }

    /// Never closed: the handle must live exactly as long as the app process.
    fn app_job() -> Option<&'static Job> {
        static JOB: OnceLock<Option<Job>> = OnceLock::new();
        JOB.get_or_init(kill_on_close_job).as_ref()
    }

    pub(super) fn assign(job: &Job, process: HANDLE) {
        // SAFETY: both handles are open for the duration of the call.
        if let Err(error) = unsafe { AssignProcessToJobObject(job.0, process) } {
            log::warn!("sidecar could not join the job object: {error}");
        }
    }

    pub fn adopt(child: &Child) {
        if let Some(job) = app_job() {
            assign(job, HANDLE(child.as_raw_handle()));
        }
    }

    /// Tauri sidecars expose only a PID, opened right after spawn while the process is alive.
    pub fn adopt_pid(pid: u32) {
        let Some(job) = app_job() else {
            return;
        };
        // SAFETY: the returned handle is owned here and closed below.
        match unsafe { OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, false, pid) } {
            Ok(process) => {
                assign(job, process);
                // SAFETY: closing the handle opened above.
                let _ = unsafe { CloseHandle(process) };
            }
            Err(error) => log::warn!("sidecar {pid} could not join the job object: {error}"),
        }
    }

    /// An open handle keeps the PID from being recycled until the watchdog has used it.
    pub struct Killer(HANDLE);
    // SAFETY: a process handle is a kernel object reference that any thread may use.
    unsafe impl Send for Killer {}

    impl Killer {
        pub fn new(child: &Child) -> Option<Self> {
            let mut duplicate = HANDLE::default();
            // SAFETY: duplicates this process's own handle to the child into this process.
            unsafe {
                DuplicateHandle(
                    GetCurrentProcess(),
                    HANDLE(child.as_raw_handle()),
                    GetCurrentProcess(),
                    &mut duplicate,
                    0,
                    false,
                    DUPLICATE_SAME_ACCESS,
                )
            }
            .ok()?;
            Some(Self(duplicate))
        }

        pub fn kill(&self) {
            // SAFETY: the handle stays open until drop.
            let _ = unsafe { TerminateProcess(self.0, 1) };
        }
    }

    impl Drop for Killer {
        fn drop(&mut self) {
            // SAFETY: closing the handle duplicated in `new`.
            let _ = unsafe { CloseHandle(self.0) };
        }
    }
}

#[cfg(not(windows))]
mod platform {
    use std::process::Child;

    pub fn adopt(_: &Child) {}

    pub fn adopt_pid(_: u32) {}

    pub struct Killer;

    impl Killer {
        pub fn new(_: &Child) -> Option<Self> {
            Some(Self)
        }

        pub fn kill(&self) {}
    }
}

pub use platform::{adopt, adopt_pid, Killer};

#[cfg(all(test, windows))]
mod tests {
    use super::platform::{assign, kill_on_close_job};
    use super::Killer;
    use std::os::windows::io::AsRawHandle;
    use std::process::{Child, Command, Stdio};
    use std::time::{Duration, Instant};
    use windows::Win32::Foundation::{CloseHandle, HANDLE};

    fn long_running() -> Child {
        Command::new("ping")
            .args(["-n", "60", "127.0.0.1"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("ping is available on Windows")
    }

    fn exits_within(child: &mut Child, limit: Duration) -> bool {
        let deadline = Instant::now() + limit;
        while Instant::now() < deadline {
            if child.try_wait().expect("child is waitable").is_some() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        false
    }

    #[test]
    fn closing_the_job_ends_its_processes() {
        let job = kill_on_close_job().expect("job object");
        let mut child = long_running();
        assign(&job, HANDLE(child.as_raw_handle()));
        // SAFETY: closing the only handle to the test's own job.
        unsafe { CloseHandle(job.0) }.expect("job handle closes");
        assert!(exits_within(&mut child, Duration::from_secs(5)));
    }

    #[test]
    fn killer_ends_the_process_it_was_made_for() {
        let mut child = long_running();
        let killer = Killer::new(&child).expect("process handle");
        killer.kill();
        assert!(exits_within(&mut child, Duration::from_secs(5)));
    }
}
