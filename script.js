const form = document.getElementById('transaction-form');
const list = document.getElementById('transaction-list');
const totalBalance = document.getElementById('total-balance');
const totalIncome = document.getElementById('total-income');
const totalExpense = document.getElementById('total-expense');
const clearBtn = document.getElementById('clear-all');

let transactions = JSON.parse(localStorage.getItem('transactions')) || [];

function updateUI() {
    if (!list || !totalBalance) return;
    
    list.innerHTML = '';
    let income = 0;
    let expense = 0;

    transactions.forEach((t, index) => {
        const row = document.createElement('tr');
        const isIncome = t.type === 'income';
        if(isIncome) income += t.amount; else expense += t.amount;

        row.innerHTML = `
            <td>${t.desc}</td>
            <td>$${t.amount.toFixed(2)}</td>
            <td class="type-${t.type}">${isIncome ? 'Ingreso' : 'Egreso'}</td>
            <td><button onclick="deleteT(${index})" style="background:none; border:none; color:#e74c3c; cursor:pointer;">✕</button></td>
        `;
        list.appendChild(row);
    });

    const total = income - expense;
    totalBalance.innerText = `$${total.toFixed(2)}`;
    totalIncome.innerText = `$${income.toFixed(2)}`;
    totalExpense.innerText = `$${expense.toFixed(2)}`;
    localStorage.setItem('transactions', JSON.stringify(transactions));
}

if (form) {
    form.onsubmit = (e) => {
        e.preventDefault();
        const transaction = {
            desc: document.getElementById('desc').value,
            amount: parseFloat(document.getElementById('amount').value) || 0,
            type: document.getElementById('type').value
        };
        transactions.push(transaction);
        form.reset();
        updateUI();
    };
}

window.deleteT = (i) => {
    transactions.splice(i, 1);
    updateUI();
};

if (clearBtn) {
    clearBtn.onclick = () => {
        if(confirm('¿Borrar todo el historial?')) {
            transactions = [];
            updateUI();
        }
    };
}

// Inicialización
document.addEventListener('DOMContentLoaded', updateUI);
updateUI();