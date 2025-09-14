document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const contactForm = document.getElementById('contact-form');

    // Login submit
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(loginForm);
        const btn = loginForm.querySelector('button');
        btn.disabled = true;
        btn.textContent = 'Iniciando...';

        try {
            const response = await fetch('/login', {method:'POST', body:formData});
            if(response.redirected){
                window.location.href = response.url;
            } else {
                alert('Usuario o contraseña incorrecta');
            }
        } catch (err){
            alert('Error de conexión. Intenta nuevamente.');
            console.error(err);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Entrar';
        }
    });

    // Contact form submit
    if(contactForm){
        contactForm.addEventListener('submit', async (e)=>{
            e.preventDefault();
            const formData = new FormData(contactForm);
            const btn = contactForm.querySelector('button');
            btn.disabled = true;
            btn.textContent = 'Enviando...';

            try{
                const response = await fetch('/contact', {method:'POST', body:formData});
                if(response.ok){
                    alert('Mensaje enviado correctamente.');
                    contactForm.reset();
                } else {
                    alert('Error al enviar. Intenta de nuevo.');
                }
            } catch(err){
                alert('Error de conexión.');
                console.error(err);
            } finally {
                btn.disabled = false;
                btn.textContent = 'Enviar Mensaje';
            }
        });
    }

    // Social buttons
    document.querySelectorAll('.social div').forEach(btn => {
        btn.addEventListener('click', () => alert(`Funcionalidad de login con ${btn.textContent.trim()} no implementada.`));
    });
});
