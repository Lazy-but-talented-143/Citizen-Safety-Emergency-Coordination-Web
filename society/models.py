from django.db import models


class Society(models.Model):
    name = models.CharField(max_length=150)
    address = models.TextField()
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    pincode = models.CharField(max_length=10)

    def __str__(self):
        return self.name


class Block(models.Model):
    society = models.ForeignKey(
        Society,
        on_delete=models.CASCADE,
        related_name="blocks"
    )
    name = models.CharField(max_length=20)

    def __str__(self):
        return f"{self.society.name} - {self.name}"


class Flat(models.Model):
    block = models.ForeignKey(
        Block,
        on_delete=models.CASCADE,
        related_name="flats"
    )
    flat_number = models.CharField(max_length=20)
    floor = models.IntegerField()

    def __str__(self):
        return f"{self.block.name}-{self.flat_number}"