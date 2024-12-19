async function registerUser(event) {
  event.preventDefault();

  const firstName = document.getElementById('first_name').value;
  const loginId = document.getElementById('login_id').value;
  const password = document.getElementById('password').value;

  try {
    const response = await fetch('/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        first_name: firstName,
        login_id: loginId,
        password: password,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      window.location.href = '/login.html';
    } else {
      alert(data.error || 'Ошибка регистрации');
    }
  } catch (err) {
    alert('Произошла ошибка: ' + err.message);
  }
}

document.getElementById('register-form').addEventListener('submit', registerUser);
