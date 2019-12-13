var selectedRow = null

// Submit button action
function onFormSubmit () {
  if (validate()) {
    var formData = readFormData()
    if (selectedRow == null) InsertNewRecord(formData)
    else { updateRecord(formData) }
    resetForm()
  }
}

// Read values from table
function readFormData () {
  var formData = {}
  formData['fullName'] = document.getElementById('fullName').value
  formData['nhiNumber'] = document.getElementById('nhiNumber').value
  formData['gestation'] = document.getElementById('gestation').value
  formData['roomNumber'] = document.getElementById('roomNumber').value
  formData['comments'] = document.getElementById('comments').value
  return formData
}

// Insert function for second table
function InsertNewRecord (data) {
  var table = document.getElementById('patientList').getElementsByTagName('tbody')[0]
  var newRow = table.insertRow(table.length)
  cell1 = newRow.insertCell(0)
  cell1.innerHTML = data.fullName
  cell2 = newRow.insertCell(1)
  cell2.innerHTML = data.nhiNumber
  cell3 = newRow.insertCell(2)
  cell3.innerHTML = data.gestation
  cell4 = newRow.insertCell(3)
  cell4.innerHTML = data.roomNumber
  cell5 = newRow.insertCell(4)
  cell5.innerHTML = data.comments
  cell6 = newRow.insertCell(5)
  cell6.innerHTML = `<a onClick='onEdit(this)'>Edit</a>
                    <a onClick='onDelete(this)'>Delete</a>`
}

function resetForm () {
  document.getElementsByTagName('patientData').value = ''
}

function onEdit (td) {
  selectedRow = td.parentElement.parentElement
  document.getElementById('fullName').value = selectedRow.cells[0].innerHTML
  document.getElementById('nhiNumber').value = selectedRow.cells[1].innerHTML
  document.getElementById('gestation').value = selectedRow.cells[2].innerHTML
  document.getElementById('roomNumber').value = selectedRow.cells[3].innerHTML
  document.getElementById('comments').value = selectedRow.cells[4].innerHTML
}

function updateRecord (formData) {
  selectedRow.cells[0].innerHTML = formData.fullName
  selectedRow.cells[1].innerHTML = formData.nhiNumber
  selectedRow.cells[2].innerHTML = formData.gestation
  selectedRow.cells[3].innerHTML = formData.roomNumber
  selectedRow.cells[4].innerHTML = formData.comments
}

function onDelete (td) {
  if (confirm('Are you sure you want to delete this record?')) {
    selectedRow = td.parentElement.parentElement
    document.getElementById('patientList').deleteRow(selectedRow.rowIndex)
    resetForm()
  }
}

function validate () {
  isValid = true
  if (document.getElementById('fullName').value === '') {
    isValid = false
    document.getElementById('fullNameValidationError').classList.remove('hide')
  } else {
    isValid = true
    if (!document.getElementById('fullNameValidationError').classList.contains('hide'))
      document.getElementById('fullNameValidationError').classList.add('hide')
  }
  return isValid
}
